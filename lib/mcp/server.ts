import { McpServer } from "@modelcontextprotocol/server";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

import { registerPriorAuthSummaryResource } from "./apps/priorAuthSummary";

import type { McpCallContext } from "./context";
import { registerGuidelineResources } from "./resources/guidelines";
import { registerAccountTools } from "./tools/account";
import { registerRetrievalTools } from "./tools/retrieval";
import { registerScreeningTool } from "./tools/screening";
import { registerSearchFetchTools } from "./tools/searchFetch";

export const MCP_SERVER_NAME = "notedoctor";

/**
 * Bumped when the published surface changes (a tool added, a schema widened),
 * not when the app deploys. It is what a client reports and what a support
 * conversation refers to, so it should mean something.
 */
export const MCP_SERVER_VERSION = "1.2.0";

export const MCP_SERVER_INSTRUCTIONS =
  "NoteDoctorAi screens prior authorization readiness against Medicare and commercial-payer coverage policy. " +
  "run_prior_auth_screening returns a complete prior authorization report for clinicians and billers, rendered in the NoteDoctor report card where the host supports MCP Apps. " +
  "Present that report in full — every criterion and sub-criterion with its status, every code, every documentation item, the limitations, missing items and the disclaimer — rather than summarizing it; where the card is not shown, relay the markdown report in the result as written. " +
  "Send clinical details only, never patient identifiers.";

/**
 * Build the server instance for one request.
 *
 * Instances are per-request by construction and hold no state, so the caller's
 * scopes can decide what is registered at all: a tool this key cannot use is
 * absent from `tools/list` rather than advertised and then refused.
 */
export function buildMcpServer(ctx: McpCallContext): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      title: "NoteDoctorAi",
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
      // Advertised unconditionally: the server is stateless per request, so
      // `tools/list` never sees the client's `initialize` capabilities, and a
      // host without MCP Apps ignores both this and the tool's `_meta.ui`.
      capabilities: {
        extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
      },
    },
  );

  registerAccountTools(server, ctx);
  registerRetrievalTools(server, ctx);
  registerScreeningTool(server, ctx);
  registerSearchFetchTools(server, ctx);
  registerGuidelineResources(server, ctx);
  registerPriorAuthSummaryResource(server, ctx);

  return server;
}
