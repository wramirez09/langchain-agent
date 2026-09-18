/**
 * @jest-environment node
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

const usageMock = jest.fn();
jest.mock("@/lib/db/repositories/usage.repo", () => ({
  getUsageSummaryByOrgId: (...a: any[]) => usageMock(...a),
}));

import { registerAccountTools } from "../tools/account";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["chat"],
  tier: "standard",
};

let server: McpServer;
let client: Client;
let metered: string[];

beforeEach(async () => {
  usageMock.mockReset();
  metered = [];
  server = new McpServer({ name: "test", version: "0.0.0" });
  registerAccountTools(server, { auth, meter: (t) => metered.push(t) });
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "harness", version: "1.0.0" });
  await Promise.all([server.connect(s), client.connect(c)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
});

describe("usage", () => {
  it("returns the month-to-date breakdown including the mcp bucket", async () => {
    usageMock.mockResolvedValue({ total: 11, agents: 3, chat: 2, mcp: 6 });

    const result: any = await client.callTool({ name: "usage", arguments: {} });

    expect(result.structuredContent).toEqual({
      period_start: expect.stringMatching(/^\d{4}-\d{2}-01T00:00:00\.000Z$/),
      total: 11,
      agents: 3,
      chat: 2,
      mcp: 6,
    });
    // Free, like /api/v1/usage.
    expect(metered).toEqual([]);
  });

  it("queries the caller's own org from the start of the current UTC month", async () => {
    usageMock.mockResolvedValue({ total: 0, agents: 0, chat: 0, mcp: 0 });
    await client.callTool({ name: "usage", arguments: {} });

    const [orgId, since] = usageMock.mock.calls[0];
    expect(orgId).toBe("org-1");
    const now = new Date();
    expect(since).toBe(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    );
  });

  it("reports a readable error when the rollup cannot be read", async () => {
    usageMock.mockRejectedValue(new Error("down"));

    const result: any = await client.callTool({ name: "usage", arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Try again shortly");
  });
});
