/**
 * @jest-environment node
 *
 * The route is transport edge only, so what is worth asserting is the gate
 * order — and that the SDK handler is never reached by a request that should
 * have been refused.
 */
const resolveMock = jest.fn();
const accessMock = jest.fn();
const rateMock = jest.fn();
const touchMock = jest.fn();
const fetchMock = jest.fn();

jest.mock("@/lib/mcp/auth", () => ({
  resolveMcpAuth: (...a: any[]) => resolveMock(...a),
  MCP_WWW_AUTHENTICATE: 'Bearer realm="notedoctor-mcp"',
}));
jest.mock("@/lib/billing/apiAccess", () => ({
  userHasApiAccess: (...a: any[]) => accessMock(...a),
}));
jest.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...a: any[]) => rateMock(...a),
}));
jest.mock("@/lib/auth/resolveApiAuth", () => ({
  touchApiKey: (...a: any[]) => touchMock(...a),
}));
jest.mock("@/lib/mcp/handler", () => ({
  getHandler: () => ({ fetch: (...a: any[]) => fetchMock(...a) }),
  toAuthInfo: (auth: any) => ({ token: "redacted", clientId: auth.apiKeyId, scopes: auth.scopes }),
}));
jest.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => void p }));

import { POST } from "../route";

const req = () => new Request("http://test.local/api/mcp", { method: "POST" });

const validAuth = {
  ok: true,
  auth: {
    orgId: "org-1",
    createdBy: "u1",
    apiKeyId: "k1",
    environment: "live",
    scopes: ["agents", "chat"],
    tier: "standard",
  },
};
const okLimit = { success: true, limit: 60, remaining: 59, retryAfterSeconds: 0, resetAtSeconds: 1 };

beforeEach(() => {
  resolveMock.mockReset();
  accessMock.mockReset();
  rateMock.mockReset();
  touchMock.mockReset();
  fetchMock.mockReset();

  resolveMock.mockResolvedValue(validAuth);
  accessMock.mockResolvedValue({ allowed: true, reason: "ok" });
  rateMock.mockResolvedValue(okLimit);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

describe("POST /api/mcp", () => {
  it("401s an unauthenticated request and prompts for a token", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Invalid or missing API key.",
    });

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer realm="notedoctor-mcp"');
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(accessMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403s a key scoped for neither agents nor chat, before any billing check", async () => {
    resolveMock.mockResolvedValue({ ...validAuth, auth: { ...validAuth.auth, scopes: [] } });

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect(accessMock).not.toHaveBeenCalled();
    expect(rateMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("402s a user without an active subscription, before the rate limiter", async () => {
    accessMock.mockResolvedValue({ allowed: false, reason: "no_subscription" });

    const res = await POST(req());

    expect(res.status).toBe(402);
    expect(rateMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429s a throttled org with Retry-After, and never reaches the handler", async () => {
    rateMock.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 30,
      resetAtSeconds: 99,
    });

    const res = await POST(req());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(touchMock).not.toHaveBeenCalled();
  });

  it("serves an authorized request and merges rate-limit and no-store headers", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The handler's own headers survive the re-wrap.
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(touchMock).toHaveBeenCalledWith("k1");
  });

  it("passes the resolved principal to the handler and nothing else", async () => {
    await POST(req());

    const [, options] = fetchMock.mock.calls[0];
    expect(options.authInfo.clientId).toBe("k1");
    expect(options.authInfo.scopes).toEqual(["agents", "chat"]);
    // The caller's key never travels past the function that hashed it.
    expect(options.authInfo.token).toBe("redacted");
  });

  it("streams an SSE body through untouched", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("event: message\ndata: {}\n\n"));
        c.close();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );

    const res = await POST(req());

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toContain("event: message");
  });
});
