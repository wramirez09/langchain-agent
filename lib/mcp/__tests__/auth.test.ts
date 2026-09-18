/**
 * @jest-environment node
 */
const resolveApiAuthMock = jest.fn();
jest.mock("@/lib/auth/resolveApiAuth", () => ({
  resolveApiAuth: (...a: any[]) => resolveApiAuthMock(...a),
}));

import { MCP_WWW_AUTHENTICATE, resolveMcpAuth } from "../auth";

describe("resolveMcpAuth", () => {
  it("delegates to the public API's key resolution, unchanged", async () => {
    const expected = { ok: true, auth: { orgId: "org-1" } };
    resolveApiAuthMock.mockResolvedValue(expected);
    const req = new Request("http://test.local/api/mcp");

    await expect(resolveMcpAuth(req)).resolves.toBe(expected);
    expect(resolveApiAuthMock).toHaveBeenCalledWith(req);
  });
});

describe("MCP_WWW_AUTHENTICATE", () => {
  it("names a bearer realm so a client prompts instead of failing opaquely", () => {
    expect(MCP_WWW_AUTHENTICATE).toBe('Bearer realm="notedoctor-mcp"');
  });
});
