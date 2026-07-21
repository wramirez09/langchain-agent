/**
 * @jest-environment node
 */

/**
 * Idempotency is the one Redis layer whose failure mode is user-visible money:
 * a dropped dedup means a second billed agent run, a wrong replay means one
 * caller seeing another's response. These cover both directions.
 */

const store = new Map<string, any>();
let redisEnabled = true;

const redisStub = {
  get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
  set: jest.fn(async (k: string, v: any, opts?: { nx?: boolean }) => {
    if (opts?.nx && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  }),
  del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
};

jest.mock("@/lib/redis", () => ({ getRedis: () => (redisEnabled ? redisStub : null) }));

import * as idempotency from "@/lib/api/idempotency";

const errorResponse = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });

function begin(overrides: Partial<Parameters<typeof idempotency.begin>[0]> = {}) {
  return idempotency.begin({
    key: "idem-1",
    orgId: "org-1",
    endpoint: "v1/agents",
    body: { messages: [{ role: "user", content: "hi" }] },
    errorResponse,
    ...overrides,
  });
}

const okResponse = (body: unknown = { message: "done" }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("idempotency", () => {
  beforeEach(() => {
    store.clear();
    redisEnabled = true;
    jest.clearAllMocks();
  });

  it("is disabled without a key", async () => {
    const r = await begin({ key: null });
    expect(r.kind).toBe("disabled");
    expect(store.size).toBe(0);
  });

  it("is disabled — not failed — when Redis is unconfigured", async () => {
    redisEnabled = false;
    expect((await begin()).kind).toBe("disabled");
  });

  it("replays the stored response for an identical retry", async () => {
    const first = await begin();
    expect(first.kind).toBe("proceed");
    if (first.kind !== "proceed") return;
    await first.commit(okResponse({ threadId: "t-1" }));

    const second = await begin();
    expect(second.kind).toBe("replay");
    if (second.kind !== "replay") return;
    expect(second.response.status).toBe(200);
    expect(second.response.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(second.response.json()).resolves.toEqual({ threadId: "t-1" });
  });

  it("returns the original response body to the first caller too", async () => {
    const first = await begin();
    if (first.kind !== "proceed") throw new Error("expected proceed");
    const returned = await first.commit(okResponse({ threadId: "t-1" }));
    await expect(returned.json()).resolves.toEqual({ threadId: "t-1" });
  });

  it("rejects the same key with a different body (422)", async () => {
    const first = await begin();
    if (first.kind !== "proceed") throw new Error("expected proceed");
    await first.commit(okResponse());

    const conflict = await begin({ body: { messages: [{ role: "user", content: "other" }] } });
    expect(conflict.kind).toBe("conflict");
    if (conflict.kind !== "conflict") return;
    expect(conflict.response.status).toBe(422);
  });

  it("returns 409 while the original request is still in flight", async () => {
    const first = await begin();
    expect(first.kind).toBe("proceed"); // slot held, never committed

    const inflight = await begin();
    expect(inflight.kind).toBe("conflict");
    if (inflight.kind !== "conflict") return;
    expect(inflight.response.status).toBe(409);
  });

  it("releases the slot on an error response so the caller can retry the same key", async () => {
    const first = await begin();
    if (first.kind !== "proceed") throw new Error("expected proceed");
    await first.commit(errorResponse("internal_error", "boom", 500));
    expect(store.size).toBe(0);

    const retry = await begin();
    expect(retry.kind).toBe("proceed"); // not permanently stuck replaying a 500
  });

  it("scopes slots per org, so identical keys across tenants never collide", async () => {
    const a = await begin({ orgId: "org-a" });
    if (a.kind !== "proceed") throw new Error("expected proceed");
    await a.commit(okResponse({ secret: "org-a data" }));

    const b = await begin({ orgId: "org-b" });
    expect(b.kind).toBe("proceed"); // org-b runs its own request, sees nothing of org-a's
  });

  it("scopes slots per endpoint", async () => {
    const a = await begin({ endpoint: "v1/agents" });
    if (a.kind !== "proceed") throw new Error("expected proceed");
    await a.commit(okResponse());

    expect((await begin({ endpoint: "v1/chat" })).kind).toBe("proceed");
  });

  it("validates key length", () => {
    expect(idempotency.isValidIdempotencyKey("a".repeat(255))).toBe(true);
    expect(idempotency.isValidIdempotencyKey("a".repeat(256))).toBe(false);
  });

  it("reads and trims the header, treating blank as absent", () => {
    const withHeader = (v: string | null) =>
      ({ headers: { get: () => v } }) as unknown as Request;
    expect(idempotency.readIdempotencyKey(withHeader("  abc  "))).toBe("abc");
    expect(idempotency.readIdempotencyKey(withHeader("   "))).toBeNull();
    expect(idempotency.readIdempotencyKey(withHeader(null))).toBeNull();
  });
});
