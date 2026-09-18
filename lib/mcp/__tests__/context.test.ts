/**
 * @jest-environment node
 */
const reportUsageMock = jest.fn();
const waitUntilMock = jest.fn();

jest.mock("@/lib/usage", () => ({ reportUsage: (...a: any[]) => reportUsageMock(...a) }));
jest.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => waitUntilMock(p) }));

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { buildCallContext, MCP_USAGE_TYPES } from "../context";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "test",
  scopes: ["agents"],
  tier: "pro",
};

beforeEach(() => {
  reportUsageMock.mockReset();
  waitUntilMock.mockReset();
  reportUsageMock.mockResolvedValue(null);
});

describe("buildCallContext", () => {
  it("bills the key's creator, attributes the org and key, and does not await", async () => {
    const ctx = buildCallContext(auth);
    ctx.meter("mcp_tool");

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    await waitUntilMock.mock.calls[0][0];

    expect(reportUsageMock).toHaveBeenCalledWith({
      userId: "u1",
      orgId: "org-1",
      apiKeyId: "k1",
      source: "api",
      usageType: "mcp_tool",
      // A test key still burns real compute, so it still meters.
      environment: "test",
    });
  });

  it("swallows a metering failure rather than failing the tool call", async () => {
    reportUsageMock.mockRejectedValue(new Error("stripe down"));
    buildCallContext(auth).meter("mcp_tool");
    await expect(waitUntilMock.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("names every usage type the endpoint reports", () => {
    expect([...MCP_USAGE_TYPES]).toEqual(["mcp_tool", "mcp_extract", "mcp_resource"]);
  });
});
