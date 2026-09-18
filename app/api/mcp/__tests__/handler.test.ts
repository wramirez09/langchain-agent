/**
 * @jest-environment node
 *
 * The HTTP entry, driven with raw JSON-RPC. `lib/mcp/__tests__/server.test.ts`
 * covers the published surface over an in-memory transport; this covers what
 * `createMcpHandler` does with a real request — including the rule that a
 * handshake and a `tools/list` must not drag the agent stack into the process.
 */
const loaded: string[] = [];

// Every heavy module a tool handler lazily imports. The factory runs on first
// import, so an empty `loaded` after a `tools/list` is proof the lazy-import
// rule holds — and that a client's first request does not pay for CMS fetches
// and an embedding preload.
jest.mock("@/lib/handlers/runAgent", () => {
  loaded.push("runAgent");
  return { runAgent: jest.fn() };
});
jest.mock("@/app/api/chat/agents/tools/medicareMultiSearchTool", () => {
  loaded.push("medicareMultiSearch");
  return { medicareMultiSearchTool: { invoke: jest.fn() } };
});
jest.mock("@/app/api/chat/agents/tools/CommercialGuidelineSearchTool", () => {
  loaded.push("commercialGuidelines");
  return { createCommercialGuidelineSearchTool: () => ({ invoke: jest.fn() }) };
});

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { getHandler, toAuthInfo } from "@/lib/mcp/handler";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["agents", "chat"],
  tier: "standard",
};

async function rpc(body: unknown): Promise<any> {
  const res = await getHandler().fetch(
    new Request("http://test.local/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
    { authInfo: toAuthInfo(auth) },
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  // The 2025-era stateless fallback answers over SSE (`event: message` +
  // `data:`), where the modern path would return a bare JSON body. Accept
  // either, so this suite asserts protocol behaviour rather than framing.
  if (!text.startsWith("event:")) return JSON.parse(text);
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data:"))!
    .slice("data:".length)
    .trim();
  return JSON.parse(data);
}

afterAll(async () => {
  await getHandler().close();
});

describe("POST /api/mcp", () => {
  it("serves a 2025-era handshake from the same handler, with no extra config", async () => {
    const result = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "legacy-harness", version: "1.0.0" },
      },
    });

    expect(result.result.serverInfo.name).toBe("notedoctor");
    expect(result.result.capabilities.tools).toBeDefined();
  });

  it("lists tools without loading the agent stack", async () => {
    const result = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    const names = result.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("medicare_multi_search");
    expect(names).toContain("run_prior_auth_screening");
    expect(loaded).toEqual([]);
  });

  it("rejects an unknown method as a protocol error, not a tool error", async () => {
    const result = await rpc({ jsonrpc: "2.0", id: 3, method: "nonsense/list" });
    expect(result.error).toBeDefined();
    expect(result.result).toBeUndefined();
  });
});
