import { hashApiKey } from "@/lib/auth/apiKeys";

/**
 * Covers the Redis-backed auth cache through `resolveApiAuth`, which is where
 * its guarantees actually matter: a cached hit must skip Postgres, and a stale
 * or unavailable cache must never turn into a wrong authentication decision.
 */

// --- Supabase stub (same shape the sibling resolveApiAuth test uses) ---------
let maybeSingleResult: { data: any; error: any } = { data: null, error: null };
const eq = jest.fn((..._a: any[]) => ({ maybeSingle: () => Promise.resolve(maybeSingleResult) }));
const select = jest.fn((..._a: any[]) => ({ eq }));
const from = jest.fn((..._a: any[]) => ({ select }));
jest.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (...a: any[]) => from(...a) } }));

// --- Redis stub -------------------------------------------------------------
const store = new Map<string, any>();
let redisEnabled = true;
let failMode: "none" | "read" | "write" = "none";

const redisStub = {
  get: jest.fn(async (k: string) => {
    if (failMode === "read") throw new Error("upstash down");
    return store.has(k) ? store.get(k) : null;
  }),
  set: jest.fn(async (k: string, v: any, opts?: { nx?: boolean }) => {
    if (failMode === "write") throw new Error("upstash down");
    if (opts?.nx && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  }),
  del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
};

jest.mock("@/lib/redis", () => ({ getRedis: () => (redisEnabled ? redisStub : null) }));

import { resolveApiAuth, touchApiKey } from "@/lib/auth/resolveApiAuth";
import { invalidateApiKeyCache } from "@/lib/auth/apiKeyCache";

function reqWith(token?: string): Request {
  const authorization = token ? `Bearer ${token}` : null;
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authorization : null) },
  } as unknown as Request;
}

const TOKEN = "sk_live_cachetest";
const validRow = {
  id: "key-1",
  org_id: "org-1",
  created_by: "user-1",
  environment: "live",
  scopes: ["agents", "chat"],
  rate_limit_tier: "pro",
  revoked_at: null,
  expires_at: null,
};

describe("API key cache", () => {
  beforeEach(() => {
    store.clear();
    redisEnabled = true;
    failMode = "none";
    maybeSingleResult = { data: null, error: null };
    jest.clearAllMocks();
  });

  it("populates the cache on a cold hit, then serves the next call without touching Postgres", async () => {
    maybeSingleResult = { data: validRow, error: null };

    const first = await resolveApiAuth(reqWith(TOKEN));
    expect(first.ok).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    const second = await resolveApiAuth(reqWith(TOKEN));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.auth.tier).toBe("pro");
    expect(from).not.toHaveBeenCalled();
  });

  it("caches rejections so an invalid key stops hitting Postgres", async () => {
    maybeSingleResult = { data: null, error: null }; // unknown key

    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("does not cache a decision it could not make (transport error)", async () => {
    maybeSingleResult = { data: null, error: { message: "connection reset" } };

    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(false);
    expect(store.size).toBe(0);

    // The next request must still ask Postgres rather than replay a guess.
    maybeSingleResult = { data: validRow, error: null };
    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(true);
  });

  it("re-checks expiry on read, so a key expiring mid-TTL stops authenticating", async () => {
    const future = new Date(Date.now() + 50).toISOString();
    maybeSingleResult = { data: { ...validRow, expires_at: future }, error: null };

    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(true);

    await new Promise((r) => setTimeout(r, 60));

    jest.clearAllMocks();
    const after = await resolveApiAuth(reqWith(TOKEN));
    expect(after.ok).toBe(false);
    expect(from).not.toHaveBeenCalled(); // decided from the cached expiry alone
  });

  it("invalidation makes a revoked key stop authenticating immediately", async () => {
    maybeSingleResult = { data: validRow, error: null };
    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(true);

    await invalidateApiKeyCache(hashApiKey(TOKEN));

    // Postgres now reflects the revocation; the cache no longer masks it.
    maybeSingleResult = { data: { ...validRow, revoked_at: new Date().toISOString() }, error: null };
    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(false);
  });

  it("falls back to Postgres when Redis is unconfigured", async () => {
    redisEnabled = false;
    maybeSingleResult = { data: validRow, error: null };

    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(true);
    expect((await resolveApiAuth(reqWith(TOKEN))).ok).toBe(true);
    expect(from).toHaveBeenCalledTimes(2); // no caching, but still correct
  });

  it("falls back to Postgres when a cache read throws", async () => {
    failMode = "read";
    maybeSingleResult = { data: validRow, error: null };

    const r = await resolveApiAuth(reqWith(TOKEN));
    expect(r.ok).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("throttles last_used_at writes to one per key per interval", async () => {
    await touchApiKey("key-1");
    await touchApiKey("key-1");
    await touchApiKey("key-1");
    // Only the slot winner writes; `from` is the Supabase update path.
    expect(from).toHaveBeenCalledTimes(1);

    await touchApiKey("key-2"); // a different key has its own slot
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("writes last_used_at unthrottled when Redis is unavailable", async () => {
    redisEnabled = false;
    await touchApiKey("key-1");
    await touchApiKey("key-1");
    expect(from).toHaveBeenCalledTimes(2);
  });
});
