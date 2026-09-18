/**
 * @jest-environment node
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";
import { ARTIFACT_JSON_EXAMPLE } from "@/lib/priorAuth/artifactSchema";
import type { ErrorResponder } from "@/lib/handlers/types";

const runAgentMock = jest.fn();
const beginMock = jest.fn();

jest.mock("@/lib/handlers/runAgent", () => ({
  runAgent: (...a: any[]) => runAgentMock(...a),
}));
jest.mock("@/lib/api/idempotency", () => ({
  begin: (...a: any[]) => beginMock(...a),
}));

import { registerScreeningTool } from "../tools/screening";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["agents"],
  tier: "standard",
};

const ARTIFACT = JSON.parse(ARTIFACT_JSON_EXAMPLE);

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

let server: McpServer;
let client: Client;
let metered: string[];

async function connect(scopes: string[] = ["agents"]): Promise<void> {
  metered = [];
  server = new McpServer({ name: "test", version: "0.0.0" });
  registerScreeningTool(server, { auth: { ...auth, scopes }, meter: (t) => metered.push(t) });
  const [c, s] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "harness", version: "1.0.0" });
  await Promise.all([server.connect(s), client.connect(c)]);
}

const ARGS = { messages: [{ role: "user" as const, content: "MRI knee, Medicare, Illinois" }] };

beforeEach(() => {
  runAgentMock.mockReset();
  beginMock.mockReset();
  beginMock.mockResolvedValue({ kind: "disabled" });
});

afterEach(async () => {
  await client?.close();
  await server?.close();
});

describe("run_prior_auth_screening", () => {
  it("is not registered at all for a key without the agents scope", async () => {
    await connect(["chat"]);
    const { tools } = await client.listTools();
    expect(tools).toEqual([]);
  });

  it("returns the artifact as structured content", async () => {
    await connect();
    runAgentMock.mockResolvedValue(
      jsonResponse({
        threadId: "11111111-1111-1111-1111-111111111111",
        messages: [
          { role: "user", content: "MRI knee" },
          { role: "assistant", content: ARTIFACT },
        ],
      }),
    );

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.threadId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.structuredContent.artifact).toMatchObject({ kind: ARTIFACT.kind });
    expect(result.structuredContent.text).toBeNull();
  });

  it("runs stateless and unpersisted, and does not double-bill the run", async () => {
    await connect();
    runAgentMock.mockResolvedValue(
      jsonResponse({ threadId: "t", messages: [{ role: "assistant", content: "no PA needed" }] }),
    );

    await client.callTool({ name: "run_prior_auth_screening", arguments: ARGS });

    const params = runAgentMock.mock.calls[0][0];
    // `source: "api"` is what keeps third-party text out of chat_messages.
    expect(params.identity.source).toBe("api");
    expect(params.clientType).toBe("mobile");
    expect(params.identity.orgId).toBe("org-1");
    // runAgent meters `orchestrator` itself; a second report would double-bill.
    expect(metered).toEqual([]);
  });

  it("falls back to text for a plain-string answer", async () => {
    await connect();
    runAgentMock.mockResolvedValue(
      jsonResponse({ threadId: "t", messages: [{ role: "assistant", content: "Ask the payer." }] }),
    );

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.structuredContent).toEqual({
      threadId: "t",
      artifact: null,
      text: "Ask the payer.",
    });
  });

  it("degrades an artifact the schema rejects into text rather than failing", async () => {
    await connect();
    // Carries the discriminator but not a valid body — `isPriorAuthArtifact`
    // would say yes and `structuredContent` validation would then fail.
    const partial = { kind: ARTIFACT.kind, schemaVersion: ARTIFACT.schemaVersion };
    runAgentMock.mockResolvedValue(
      jsonResponse({ threadId: "t", messages: [{ role: "assistant", content: partial }] }),
    );

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.artifact).toBeNull();
    expect(JSON.parse(result.structuredContent.text)).toEqual(partial);
  });

  it("surfaces a handled error with its request id and does not parse a body", async () => {
    await connect();
    runAgentMock.mockImplementation(async (params: { respondError: ErrorResponder }) =>
      params.respondError({
        code: "agent_error",
        message: "The agent timed out.",
        status: 504,
        requestId: "req_42",
      }),
    );

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("The agent timed out. (request req_42)");
  });

  it("refuses to start a second billed run while an identical one is in flight", async () => {
    await connect();
    beginMock.mockResolvedValue({
      kind: "conflict",
      response: new Response(null, { status: 409 }),
    });

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already running");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("replays a completed identical run without re-running the agent", async () => {
    await connect();
    beginMock.mockResolvedValue({
      kind: "replay",
      response: jsonResponse({
        threadId: "t",
        messages: [{ role: "assistant", content: "cached answer" }],
      }),
    });

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.structuredContent.text).toBe("cached answer");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("derives its idempotency key from the inputs, scoped to the org and tool", async () => {
    await connect();
    runAgentMock.mockResolvedValue(
      jsonResponse({ threadId: "t", messages: [{ role: "assistant", content: "x" }] }),
    );

    await client.callTool({ name: "run_prior_auth_screening", arguments: ARGS });
    const first = beginMock.mock.calls[0][0];

    await client.callTool({ name: "run_prior_auth_screening", arguments: ARGS });
    const second = beginMock.mock.calls[1][0];

    expect(first.endpoint).toBe("mcp/run_prior_auth_screening");
    expect(first.orgId).toBe("org-1");
    expect(first.key).toMatch(/^[0-9a-f]{64}$/);
    // Same inputs must land on the same slot — that is what makes a timed-out
    // client's retry free instead of a second billed run.
    expect(second.key).toBe(first.key);
  });

  it("reports an unexpected throw as a tool error", async () => {
    await connect();
    runAgentMock.mockRejectedValue(new Error("boom"));

    const result: any = await client.callTool({
      name: "run_prior_auth_screening",
      arguments: ARGS,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("boom");
  });

  it("rejects an empty conversation before running anything", async () => {
    await connect();
    const result: any = await client
      .callTool({ name: "run_prior_auth_screening", arguments: { messages: [] } })
      .catch((e) => ({ isError: true, thrown: e }));

    expect(result.isError).toBe(true);
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});
