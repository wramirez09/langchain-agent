import type { CallToolResult } from "@modelcontextprotocol/server";

import type { McpCallContext } from "./context";
import { normalizeToolText, truncateForClient } from "./limits";

/** The slice of LangChain's `StructuredTool` this bridge actually uses. */
type StructuredToolLike = { invoke: (args: any) => Promise<unknown> };

/** An MCP tool error: readable text the calling model can act on. */
export function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Bridge one LangChain `StructuredTool` onto one MCP `tools/call`.
 *
 * `load` is a thunk, and every caller passes `() => import(...)`. That is not
 * style: `lib/handlers/runAgent` calls `startCmsWarmup()` at module scope and
 * `CommercialGuidelineSearchTool` throws at import time without a service-role
 * key, so a static import would fire CMS fetches and an embedding preload on
 * every `initialize` and `tools/list` — i.e. on every client's first request,
 * before anyone has called a tool.
 *
 * Metering happens only when the underlying tool actually produced output. A
 * deployment-configuration failure or an upstream error delivered nothing, and
 * billing for it would be billing for an error message.
 */
export async function callStructuredTool(opts: {
  load: () => Promise<StructuredToolLike>;
  args: unknown;
  ctx: McpCallContext;
  usageType: string;
}): Promise<CallToolResult> {
  const { load, args, ctx, usageType } = opts;

  let tool: StructuredToolLike;
  try {
    tool = await load();
  } catch (e) {
    console.warn("[MCP] tool unavailable:", (e as Error).message);
    return toolError(
      "This tool is not configured on this deployment. Contact support if you expected it to be available.",
    );
  }

  let raw: unknown;
  try {
    raw = await tool.invoke(args);
  } catch (e) {
    // Upstream (CMS, Supabase, OpenAI) failures are retryable by the model, so
    // they are tool errors rather than protocol errors.
    return toolError(`The tool failed: ${(e as Error).message}`);
  }

  ctx.meter(usageType);

  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  return textResult(truncateForClient(normalizeToolText(text)));
}
