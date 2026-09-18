/**
 * @jest-environment node
 */
import { callStructuredTool, toolError } from "../adapt";
import type { McpCallContext } from "../context";
import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

const auth: ApiAuthContext = {
  orgId: "org-1",
  createdBy: "u1",
  apiKeyId: "k1",
  environment: "live",
  scopes: ["agents", "chat"],
  tier: "standard",
};

function ctxWithMeter(): { ctx: McpCallContext; metered: string[] } {
  const metered: string[] = [];
  return { ctx: { auth, meter: (t) => metered.push(t) }, metered };
}

const textOf = (r: { content: any[] }) => r.content[0].text as string;

describe("callStructuredTool", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("returns the tool's JSON and meters the call once", async () => {
    const { ctx, metered } = ctxWithMeter();
    const invoke = jest.fn().mockResolvedValue(JSON.stringify({ topMatches: [] }));

    const result = await callStructuredTool({
      load: async () => ({ invoke }),
      args: { query: "mri knee" },
      ctx,
      usageType: "mcp_tool",
    });

    expect(invoke).toHaveBeenCalledWith({ query: "mri knee" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result as any))).toEqual({ topMatches: [] });
    expect(metered).toEqual(["mcp_tool"]);
  });

  it("flattens the extractor's array-of-JSON-strings shape", async () => {
    const { ctx } = ctxWithMeter();
    const members = [JSON.stringify({ policyUrl: "a" }), JSON.stringify({ policyUrl: "b" })];

    const result = await callStructuredTool({
      load: async () => ({ invoke: async () => JSON.stringify(members) }),
      args: {},
      ctx,
      usageType: "mcp_extract",
    });

    expect(JSON.parse(textOf(result as any))).toEqual([{ policyUrl: "a" }, { policyUrl: "b" }]);
  });

  it("caps an oversized payload", async () => {
    const { ctx } = ctxWithMeter();
    const result = await callStructuredTool({
      load: async () => ({ invoke: async () => "y".repeat(200_000) }),
      args: {},
      ctx,
      usageType: "mcp_tool",
    });

    expect(textOf(result as any).length).toBeLessThanOrEqual(60_000);
    expect(textOf(result as any)).toContain("[truncated:");
  });

  it("serializes a tool that returns a non-string", async () => {
    const { ctx } = ctxWithMeter();
    const result = await callStructuredTool({
      load: async () => ({ invoke: async () => ({ ok: true }) }),
      args: {},
      ctx,
      usageType: "mcp_tool",
    });
    expect(JSON.parse(textOf(result as any))).toEqual({ ok: true });
  });

  it("reports an unconfigured deployment without billing for it", async () => {
    const { ctx, metered } = ctxWithMeter();
    const result = await callStructuredTool({
      load: async () => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      },
      args: {},
      ctx,
      usageType: "mcp_tool",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as any)).toContain("not configured on this deployment");
    // The caller's key is not leaked back, and nothing is metered.
    expect(textOf(result as any)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(metered).toEqual([]);
  });

  it("turns an upstream failure into a retryable tool error, unmetered", async () => {
    const { ctx, metered } = ctxWithMeter();
    const result = await callStructuredTool({
      load: async () => ({
        invoke: async () => {
          throw new Error("CMS timed out");
        },
      }),
      args: {},
      ctx,
      usageType: "mcp_tool",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as any)).toContain("CMS timed out");
    expect(metered).toEqual([]);
  });
});

describe("toolError", () => {
  it("is a text result flagged as an error", () => {
    const r = toolError("nope");
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: "nope" }]);
  });
});
