/**
 * @jest-environment node
 *
 * Drives the real MCP client against the real handler in process, over the
 * actual JSON-RPC wire. Hand-asserting a tool registry would test our own
 * bookkeeping; this tests what a client sees.
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { buildMcpServer } from "../server";

const invoked = jest.fn();

// The one tool this suite calls. Mocked so a `tools/call` assertion cannot
// reach CMS, and so "was the underlying tool invoked?" is observable.
jest.mock("@/app/api/chat/agents/tools/medicareMultiSearchTool", () => ({
  medicareMultiSearchTool: {
    invoke: (args: unknown) => {
      invoked(args);
      return Promise.resolve(JSON.stringify({ topMatches: [] }));
    },
  },
}));

const auth = (scopes: string[]): ApiAuthContext => ({
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes,
  tier: "standard",
});

let server: McpServer;
let client: Client;
let metered: string[];

/**
 * A linked in-memory transport pair rather than the HTTP transport: the point
 * here is the published surface (what `tools/list` says, what a `tools/call`
 * does), and the streamable-HTTP client keeps timers alive past the suite.
 * `app/api/mcp/__tests__/handler.test.ts` covers the HTTP entry with raw
 * JSON-RPC instead.
 */
async function connect(scopes: string[]): Promise<void> {
  metered = [];
  server = buildMcpServer({ auth: auth(scopes), meter: (t) => metered.push(t) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-harness", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

afterEach(async () => {
  invoked.mockReset();
  await client?.close();
  await server?.close();
});

async function toolNames(): Promise<string[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

describe("tools/list", () => {
  it("publishes the full surface to a key with both scopes", async () => {
    await connect(["agents", "chat"]);
    expect(await toolNames()).toEqual([
      "commercial_guidelines_search",
      "local_coverage_article_search",
      "local_lcd_search",
      "medicare_multi_search",
      "medicare_policy_detail",
      "ncd_coverage_search",
      "policy_content_extractor",
      "run_prior_auth_screening",
      "usage",
      "whoami",
    ]);
  });

  it("omits the screening tool entirely for a chat-only key", async () => {
    await connect(["chat"]);
    const names = await toolNames();
    expect(names).not.toContain("run_prior_auth_screening");
    expect(names).toContain("medicare_multi_search");
    expect(names).toContain("whoami");
  });

  it("derives a JSON Schema carrying the zod descriptions and required fields", async () => {
    await connect(["agents", "chat"]);
    const { tools } = await client.listTools();
    const search = tools.find((t) => t.name === "medicare_multi_search")!;
    const schema = search.inputSchema as any;

    expect(schema.required).toEqual(["query"]);
    expect(schema.properties.query.description).toContain("treatment, diagnosis");
    expect(schema.properties.state.description).toContain("state");
    // The published description is ours, not the agent-facing one.
    expect(search.description).toContain("no patient names");
    expect(search.description).not.toContain("CONFIDENTIALITY");
  });

  it("never publishes the generic web search", async () => {
    await connect(["agents", "chat"]);
    expect(await toolNames()).not.toContain("search");
  });
});

describe("tools/call", () => {
  it("passes validated arguments through and meters the call", async () => {
    await connect(["agents", "chat"]);
    const result: any = await client.callTool({
      name: "medicare_multi_search",
      arguments: { query: "mri lumbar spine", state: "Illinois" },
    });

    expect(result.isError).toBeFalsy();
    expect(invoked).toHaveBeenCalledWith(
      expect.objectContaining({ query: "mri lumbar spine", state: "Illinois" }),
    );
    expect(metered).toEqual(["mcp_tool"]);
  });

  it("rejects a schema violation before the underlying tool runs", async () => {
    await connect(["agents", "chat"]);
    const result: any = await client
      .callTool({ name: "medicare_multi_search", arguments: { query: 42 } })
      .catch((e) => ({ isError: true, thrown: e }));

    expect(result.isError).toBe(true);
    expect(invoked).not.toHaveBeenCalled();
    expect(metered).toEqual([]);
  });

  it("asks for a state rather than running a nationwide LCD search", async () => {
    await connect(["agents", "chat"]);
    const result: any = await client.callTool({
      name: "local_lcd_search",
      arguments: { query: "knee mri" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("MAC region");
    expect(metered).toEqual([]);
  });

  it("returns key introspection as structured content", async () => {
    await connect(["chat"]);
    const result: any = await client.callTool({ name: "whoami", arguments: {} });

    expect(result.structuredContent).toEqual({
      org_id: "org-1",
      environment: "live",
      scopes: ["chat"],
      rate_limit_tier: "standard",
    });
    // Account tools are free, like /api/v1/me.
    expect(metered).toEqual([]);
  });
});

describe("resources", () => {
  it("publishes none while the guideline flag is off", async () => {
    delete process.env.MCP_EXPOSE_GUIDELINE_RESOURCES;
    await connect(["agents", "chat"]);
    const { resources } = await client.listResources();
    expect(resources).toEqual([]);
  });
});
