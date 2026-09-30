/**
 * @jest-environment node
 */
const resolveApiAuthMock = jest.fn();
const verifyOAuthMock = jest.fn();
jest.mock("@/lib/auth/resolveApiAuth", () => ({
  resolveApiAuth: (...a: any[]) => resolveApiAuthMock(...a),
}));
jest.mock("../oauth/verifyToken", () => ({
  verifyOAuthToken: (...a: any[]) => verifyOAuthMock(...a),
}));

import { mcpWwwAuthenticate, rateLimitSubject, resolveMcpAuth } from "../auth";

const reqWith = (authorization?: string) =>
  new Request("http://test.local/api/mcp", {
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  resolveApiAuthMock.mockReset();
  verifyOAuthMock.mockReset();
});

describe("resolveMcpAuth", () => {
  it("sends an sk_ key through the public API's key resolution, unchanged", async () => {
    const expected = { ok: true, auth: { orgId: "org-1" } };
    resolveApiAuthMock.mockResolvedValue(expected);
    const req = reqWith("Bearer sk_live_abc");

    await expect(resolveMcpAuth(req)).resolves.toBe(expected);
    expect(resolveApiAuthMock).toHaveBeenCalledWith(req);
    expect(verifyOAuthMock).not.toHaveBeenCalled();
  });

  it("sends a missing header to key resolution, which owns the uniform 401", async () => {
    resolveApiAuthMock.mockResolvedValue({ ok: false, status: 401 });
    await resolveMcpAuth(reqWith());
    expect(resolveApiAuthMock).toHaveBeenCalled();
    expect(verifyOAuthMock).not.toHaveBeenCalled();
  });

  it("treats any other bearer token as an OAuth access token", async () => {
    const expected = { ok: true, auth: { orgId: "org-1", apiKeyId: null } };
    verifyOAuthMock.mockResolvedValue(expected);

    await expect(
      resolveMcpAuth(reqWith("Bearer eyJhbGciOi.x.y")),
    ).resolves.toBe(expected);
    expect(verifyOAuthMock).toHaveBeenCalledWith("eyJhbGciOi.x.y");
    expect(resolveApiAuthMock).not.toHaveBeenCalled();
  });
});

describe("rateLimitSubject", () => {
  const base = {
    orgId: "o",
    createdBy: "u1",
    environment: "live" as const,
    scopes: [],
    tier: "standard",
  };

  it("keeps an API key's own bucket", () => {
    expect(rateLimitSubject({ ...base, apiKeyId: "k1" })).toBe("k1");
  });

  it("buckets an OAuth caller per client and user", () => {
    expect(
      rateLimitSubject({ ...base, apiKeyId: null, oauthClientId: "c1" }),
    ).toBe("oauth:c1:u1");
  });
});

describe("mcpWwwAuthenticate", () => {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  });

  it("names the protected resource metadata so connectors can start OAuth", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    expect(mcpWwwAuthenticate()).toBe(
      'Bearer realm="notedoctor-mcp", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("falls back to the bare realm rather than throwing without a site URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(mcpWwwAuthenticate()).toBe('Bearer realm="notedoctor-mcp"');
  });
});
