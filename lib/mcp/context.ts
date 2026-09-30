import { waitUntil } from "@vercel/functions";

import type { McpAuthContext } from "./auth";

/**
 * Everything a tool handler needs about the caller, built once per request by
 * the route and closed over by the registered handlers.
 *
 * `meter` is fire-and-forget on purpose: metering must never add latency to a
 * tool call, and a Stripe or Postgres hiccup must never fail a call the caller
 * already paid for in compute.
 */
export type McpCallContext = {
  auth: McpAuthContext;
  meter: (usageType: string) => void;
};

/** Usage types billed by this surface. Keep in sync with `usage.repo`'s `mcp` bucket. */
export const MCP_USAGE_TYPES = ["mcp_tool", "mcp_extract", "mcp_resource"] as const;

export function buildCallContext(auth: McpAuthContext): McpCallContext {
  return {
    auth,
    meter: (usageType: string) => {
      // Lazy: `lib/usage` reaches `lib/supabaseAdmin`, which throws at import
      // time without a service-role key, and this module is built on every
      // request including `initialize` and `tools/list`.
      waitUntil(
        import("@/lib/usage")
          .then(({ reportUsage }) =>
            reportUsage({
              userId: auth.createdBy,
              orgId: auth.orgId,
              apiKeyId: auth.apiKeyId ?? undefined,
              source: "api",
              usageType,
              environment: auth.environment,
            }),
          )
          .catch(() => undefined),
      );
    },
  };
}
