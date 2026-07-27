import { hashApiKey } from "@/lib/auth/apiKeys";

// Mock the service-role client. resolveApiAuth calls:
//   supabaseAdmin.from("api_keys").select(...).eq("key_hash", h).maybeSingle()
let maybeSingleResult: { data: any; error: any } = { data: null, error: null };
const eq = jest.fn((..._a: any[]) => ({ maybeSingle: () => Promise.resolve(maybeSingleResult) }));
const select = jest.fn((..._a: any[]) => ({ eq }));
const from = jest.fn((..._a: any[]) => ({ select }));

jest.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (...a: any[]) => from(...a) } }));

import { resolveApiAuth } from "@/lib/auth/resolveApiAuth";

// resolveApiAuth only reads req.headers.get("authorization"); a minimal stub
// avoids depending on a global Request (absent under jsdom).
function reqWith(token?: string): Request {
  const authorization = token ? `Bearer ${token}` : null;
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authorization : null) },
  } as unknown as Request;
}

const validRow = {
  id: "key-1",
  org_id: "org-1",
  created_by: "user-1",
  environment: "live",
  scopes: ["agents", "chat"],
  rate_limit_tier: "standard",
  revoked_at: null,
  expires_at: null,
};

describe("resolveApiAuth", () => {
  beforeEach(() => {
    maybeSingleResult = { data: null, error: null };
    jest.clearAllMocks();
  });

  it("rejects a missing Authorization header", async () => {
    const r = await resolveApiAuth(reqWith());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
    expect(from).not.toHaveBeenCalled(); // never touches the DB
  });

  it("rejects a non-API-key bearer token (e.g. a Supabase JWT)", async () => {
    const r = await resolveApiAuth(reqWith("eyJhbGciOiJIUzI1NiJ9.payload.sig"));
    expect(r.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("authenticates a valid key and returns org-scoped context", async () => {
    maybeSingleResult = { data: validRow, error: null };
    const r = await resolveApiAuth(reqWith("sk_live_abc"));
    expect(eq).toHaveBeenCalledWith("key_hash", hashApiKey("sk_live_abc"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.auth.orgId).toBe("org-1");
      expect(r.auth.createdBy).toBe("user-1");
      expect(r.auth.apiKeyId).toBe("key-1");
      expect(r.auth.scopes).toEqual(["agents", "chat"]);
    }
  });

  it("rejects an unknown key", async () => {
    maybeSingleResult = { data: null, error: null };
    const r = await resolveApiAuth(reqWith("sk_live_unknown"));
    expect(r.ok).toBe(false);
  });

  it("rejects a revoked key", async () => {
    maybeSingleResult = { data: { ...validRow, revoked_at: "2020-01-01T00:00:00Z" }, error: null };
    const r = await resolveApiAuth(reqWith("sk_live_abc"));
    expect(r.ok).toBe(false);
  });

  it("rejects an expired key", async () => {
    maybeSingleResult = { data: { ...validRow, expires_at: "2000-01-01T00:00:00Z" }, error: null };
    const r = await resolveApiAuth(reqWith("sk_live_abc"));
    expect(r.ok).toBe(false);
  });

  it("rejects on a DB error", async () => {
    maybeSingleResult = { data: null, error: { message: "boom" } };
    const r = await resolveApiAuth(reqWith("sk_live_abc"));
    expect(r.ok).toBe(false);
  });
});
