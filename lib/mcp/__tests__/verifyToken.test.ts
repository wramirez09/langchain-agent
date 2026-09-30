/**
 * @jest-environment node
 */
const getClaimsMock = jest.fn();
const orgMock = jest.fn();
jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { auth: { getClaims: (...a: any[]) => getClaimsMock(...a) } },
}));
jest.mock("@/lib/auth/getOrgIdForUser", () => ({
  getOrgIdForUser: (...a: any[]) => orgMock(...a),
}));

import { verifyOAuthToken } from "../oauth/verifyToken";

const ISS = "https://ref.supabase.co/auth/v1";
const future = () => Math.floor(Date.now() / 1000) + 3600;
const claims = (over: Record<string, unknown> = {}) => ({
  data: {
    claims: { iss: ISS, sub: "u1", client_id: "c1", exp: future(), ...over },
  },
  error: null,
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co";
  getClaimsMock.mockReset();
  orgMock.mockReset();
  orgMock.mockResolvedValue("org-1");
});

describe("verifyOAuthToken", () => {
  it("maps a connector token to the user's org with default scopes and no key id", async () => {
    getClaimsMock.mockResolvedValue(claims());
    const res = await verifyOAuthToken("tok");

    expect(getClaimsMock).toHaveBeenCalledWith("tok");
    expect(orgMock).toHaveBeenCalledWith("u1");
    expect(res).toEqual({
      ok: true,
      auth: expect.objectContaining({
        orgId: "org-1",
        createdBy: "u1",
        apiKeyId: null,
        oauthClientId: "c1",
        environment: "live",
        scopes: ["agents", "chat"],
        tier: "standard",
      }),
    });
  });

  it.each([
    ["a plain web-session JWT (no client_id)", { client_id: undefined }],
    ["another project's token", { iss: "https://other.supabase.co/auth/v1" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["a token without a subject", { sub: "" }],
  ])("rejects %s", async (_label, over) => {
    getClaimsMock.mockResolvedValue(claims(over));
    const res = await verifyOAuthToken("tok");
    expect(res).toMatchObject({ ok: false, status: 401, code: "unauthorized" });
    expect(orgMock).not.toHaveBeenCalled();
  });

  it("rejects a token Supabase will not verify", async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: new Error("bad signature"),
    });
    expect(await verifyOAuthToken("tok")).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rejects when verification throws", async () => {
    getClaimsMock.mockRejectedValue(new Error("network"));
    expect(await verifyOAuthToken("tok")).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("refuses a user with no org rather than serving unbilled", async () => {
    getClaimsMock.mockResolvedValue(claims());
    orgMock.mockResolvedValue(null);
    expect(await verifyOAuthToken("tok")).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
