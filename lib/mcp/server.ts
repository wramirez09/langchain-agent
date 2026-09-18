import { McpServer } from "@modelcontextprotocol/server";

import type { McpCallContext } from "./context";
import { registerGuidelineResources } from "./resources/guidelines";
import { registerAccountTools } from "./tools/account";
import { registerRetrievalTools } from "./tools/retrieval";
import { registerScreeningTool } from "./tools/screening";

export const MCP_SERVER_NAME = "notedoctor";

/**
 * Bumped when the published surface changes (a tool added, a schema widened),
 * not when the app deploys. It is what a client reports and what a support
 * conversation refers to, so it should mean something.
 */
export const MCP_SERVER_VERSION = "1.0.0";

/**
 * Build the server instance for one request.
 *
 * Instances are per-request by construction and hold no state, so the caller's
 * scopes can decide what is registered at all: a tool this key cannot use is
 * absent from `tools/list` rather than advertised and then refused.
 */
export function buildMcpServer(ctx: McpCallContext): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    title: "NoteDoctorAi",
  });

  registerAccountTools(server, ctx);
  registerRetrievalTools(server, ctx);
  registerScreeningTool(server, ctx);
  registerGuidelineResources(server, ctx);

  return server;
}
