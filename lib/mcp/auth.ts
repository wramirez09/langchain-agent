import { resolveApiAuth, type ApiAuthResult } from "@/lib/auth/resolveApiAuth";

/**
 * The MCP endpoint's authentication seam.
 *
 * Today this is a straight delegate to the public API's key resolution: MCP
 * clients send the same `Authorization: Bearer sk_live_…` key as every other
 * `/api/v1` caller, and no separate credential exists. It is a named function
 * rather than a direct call from the route because OAuth is the obvious next
 * phase — the MCP spec's authorization flow lands here, branching on token
 * shape, without the route or any tool handler changing.
 */
export function resolveMcpAuth(req: Request): Promise<ApiAuthResult> {
  return resolveApiAuth(req);
}

/**
 * `WWW-Authenticate` on a 401 so a client prompts for a token instead of
 * failing opaquely — and the header an OAuth-capable client would read for
 * discovery once that phase exists.
 */
export const MCP_WWW_AUTHENTICATE = 'Bearer realm="notedoctor-mcp"';
