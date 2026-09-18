import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

import { toolError } from "../adapt";
import type { McpCallContext } from "../context";

/**
 * Account tools: the MCP mirrors of `/api/v1/me` and `/api/v1/usage`.
 *
 * Unmetered and scope-free, exactly like those two routes — they are how an
 * integrator confirms which credentials their editor is actually using, and
 * charging for that would be charging someone to find out what they are being
 * charged for. They still consume the org's rate limit, because an uncapped
 * authenticated route is an uncapped route.
 */
export function registerAccountTools(server: McpServer, ctx: McpCallContext): void {
  const { auth } = ctx;

  server.registerTool(
    "whoami",
    {
      title: "Key introspection",
      description:
        "Return the org, environment, scopes and rate-limit tier of the API key this connection is authenticated with. Useful for confirming whether a `test` or `live` key is in use.",
      outputSchema: z.object({
        org_id: z.string(),
        environment: z.enum(["live", "test"]),
        scopes: z.array(z.string()),
        rate_limit_tier: z.string(),
      }),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const out = {
        org_id: auth.orgId,
        environment: auth.environment,
        scopes: auth.scopes,
        rate_limit_tier: auth.tier,
      };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );

  server.registerTool(
    "usage",
    {
      title: "Usage this month",
      description:
        "Return this org's request counts for the current calendar month (UTC), broken down by surface: `agents` (full screenings), `chat`, and `mcp` (tool and resource calls made over this connection).",
      outputSchema: z.object({
        period_start: z.string(),
        total: z.number(),
        agents: z.number(),
        chat: z.number(),
        mcp: z.number(),
      }),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const now = new Date();
      const periodStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString();

      try {
        // Lazy: the repo reaches `lib/supabaseAdmin`, which throws at import
        // time without a service-role key. `buildMcpServer` runs on every
        // request, so a static import would turn a missing key into a dead
        // endpoint rather than one failing tool.
        const { getUsageSummaryByOrgId } = await import("@/lib/db/repositories/usage.repo");
        const summary = await getUsageSummaryByOrgId(auth.orgId, periodStart);
        const out = { period_start: periodStart, ...summary };
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
      } catch {
        return toolError("Usage could not be loaded right now. Try again shortly.");
      }
    },
  );
}
