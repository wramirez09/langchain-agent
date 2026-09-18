/**
 * @jest-environment node
 *
 * Every published retrieval tool, called once end to end: the point is that
 * each registration's lazy import really resolves the export it names, and
 * each one bills under the usage type it was priced at. A registry of
 * hand-written thunks is exactly the kind of thing that goes stale silently.
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

const calls: Record<string, unknown> = {};
const stub = (key: string) => ({
  invoke: (args: unknown) => {
    calls[key] = args;
    return Promise.resolve(JSON.stringify({ ok: key }));
  },
});

jest.mock("@/app/api/chat/agents/tools/medicareMultiSearchTool", () => ({
  medicareMultiSearchTool: stub("medicare_multi_search"),
}));
jest.mock("@/app/api/chat/agents/tools/NCDCoverageSearchTool", () => ({
  NCDCoverageSearchTool: class {
    invoke = stub("ncd_coverage_search").invoke;
  },
}));
jest.mock("@/app/api/chat/agents/tools/localLcdSearchTool", () => ({
  localLcdSearchTool: stub("local_lcd_search"),
}));
jest.mock("@/app/api/chat/agents/tools/localArticleSearchTool", () => ({
  localCoverageArticleSearchTool: stub("local_coverage_article_search"),
}));
jest.mock("@/app/api/chat/agents/tools/medicarePolicyDetailTool", () => ({
  medicarePolicyDetailTool: stub("medicare_policy_detail"),
}));
jest.mock("@/app/api/chat/agents/tools/CommercialGuidelineSearchTool", () => ({
  createCommercialGuidelineSearchTool: () => stub("commercial_guidelines_search"),
}));
jest.mock("@/app/api/chat/agents/tools/policyContentExtractorTool", () => ({
  policyContentExtractorTool: stub("policy_content_extractor"),
}));

import { registerRetrievalTools } from "../tools/retrieval";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["agents", "chat"],
  tier: "standard",
};

let server: McpServer;
let client: Client;
let metered: string[];

beforeEach(async () => {
  for (const k of Object.keys(calls)) delete calls[k];
  metered = [];
  server = new McpServer({ name: "test", version: "0.0.0" });
  registerRetrievalTools(server, { auth, meter: (t) => metered.push(t) });
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "harness", version: "1.0.0" });
  await Promise.all([server.connect(s), client.connect(c)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
});

const SEARCH_ARGS = { query: "mri lumbar spine", state: "Illinois" };

const CASES: [string, Record<string, unknown>, string][] = [
  ["medicare_multi_search", SEARCH_ARGS, "mcp_tool"],
  ["ncd_coverage_search", SEARCH_ARGS, "mcp_tool"],
  ["local_lcd_search", SEARCH_ARGS, "mcp_tool"],
  ["local_coverage_article_search", SEARCH_ARGS, "mcp_tool"],
  ["commercial_guidelines_search", { query: "knee mri", payer: "Aetna" }, "mcp_tool"],
  [
    "medicare_policy_detail",
    { documentType: "lcd", documentId: "L12345", documentVersion: 3 },
    "mcp_tool",
  ],
  [
    "policy_content_extractor",
    { policyUrls: ["https://policies.aetna.com/x.html"] },
    "mcp_extract",
  ],
];

describe.each(CASES)("%s", (name, args, usageType) => {
  it("reaches its tool and bills the expected usage type", async () => {
    const result: any = await client.callTool({ name, arguments: args });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: name });
    expect(calls[name]).toEqual(expect.objectContaining(args));
    expect(metered).toEqual([usageType]);
  });
});

it("prices the extractor apart from the search tools", () => {
  const extract = CASES.find(([n]) => n === "policy_content_extractor")![2];
  const search = CASES.find(([n]) => n === "medicare_multi_search")![2];
  expect(extract).not.toBe(search);
});
