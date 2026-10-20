import type { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

import type { McpCallContext } from "../context";
import { canUse } from "../policy";

/**
 * MCP Apps (`io.modelcontextprotocol/ui`, spec 2026-01-26) view for
 * `run_prior_auth_screening`.
 *
 * Without it a host hands the model our JSON and the model rewrites it into a
 * condensed summary, so the clinician never sees the full report. With it, a
 * supporting host (Claude, ChatGPT) fetches this resource and renders the
 * artifact inline from the tool result's `structuredContent`.
 *
 * The HTML is a single self-contained file built from `mcp-apps/prior-auth-summary`
 * by `yarn build:mcp-app` and checked in as a string module, so Vercel serves
 * it without file tracing and there is nothing to fetch at runtime. No `csp`
 * is declared: the view makes no network requests, and the spec's restrictive
 * default is exactly what it needs.
 */

export const PRIOR_AUTH_SUMMARY_URI = "ui://notedoctor/prior-auth-summary.html";

export function registerPriorAuthSummaryResource(
  server: McpServer,
  ctx: McpCallContext,
): void {
  // Only the screening tool links to this view, so it follows that tool's scope.
  if (!canUse(ctx.auth, "run_prior_auth_screening")) return;

  registerAppResource(
    server,
    "Prior authorization report",
    PRIOR_AUTH_SUMMARY_URI,
    {
      description:
        "Renders a run_prior_auth_screening result as the full NoteDoctorAi report card.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: { prefersBorder: true } },
    },
    async () => {
      // Lazy: ~390 KB of HTML has no business in every `initialize`.
      // Not metered — this is the report's chrome, not data.
      const { PRIOR_AUTH_SUMMARY_HTML } =
        await import("./generated/priorAuthSummaryHtml");
      return {
        contents: [
          {
            uri: PRIOR_AUTH_SUMMARY_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: PRIOR_AUTH_SUMMARY_HTML,
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
    },
  );
}
