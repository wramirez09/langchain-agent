import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";

import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

import { buildCallContext } from "./context";
import { buildMcpServer } from "./server";

/**
 * The single place the MCP SDK is instantiated.
 *
 * The factory runs once per request and the instance holds nothing between
 * requests, so one memoized handler scales horizontally as-is. Response mode
 * is left at its default: a single JSON body, upgrading to SSE only when a
 * handler emits a notification before its result — which is exactly the
 * behaviour the screening tool's progress notifications want. Legacy serving
 * is also left at its default (`stateless`), which is what lets 2025-era
 * clients work against this endpoint with no extra configuration.
 *
 * `authInfo` is strictly pass-through — the SDK never reads headers or
 * verifies tokens — so authentication stays in front of the handler in the
 * route, and every existing public-API contract is preserved byte for byte.
 */
let handler: McpHttpHandler | null = null;

export function getHandler(): McpHttpHandler {
  if (handler) return handler;
  handler = createMcpHandler(
    (reqCtx) => {
      const auth = reqCtx.authInfo?.extra?.auth as ApiAuthContext | undefined;
      if (!auth) {
        // Unreachable through the route, which rejects before it gets here.
        throw new Error("MCP handler reached without resolved auth.");
      }
      return buildMcpServer(buildCallContext(auth));
    },
    { onerror: (e) => console.warn("[MCP] handler error:", e.message) },
  );
  return handler;
}

/**
 * Wrap our resolved API-key auth in the SDK's `AuthInfo` envelope.
 *
 * `token` is required by the type but deliberately not the caller's key: the
 * SDK never inspects it, and the plaintext secret has no reason to travel any
 * further than the function that hashed it. Everything the tools need rides in
 * `extra.auth`.
 */
export function toAuthInfo(auth: ApiAuthContext) {
  return {
    token: "redacted",
    clientId: auth.apiKeyId,
    scopes: auth.scopes,
    extra: { auth },
  };
}
