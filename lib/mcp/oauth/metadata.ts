/**
 * OAuth discovery for the MCP endpoint (RFC 9728 protected resource metadata).
 *
 * claude.ai and ChatGPT connectors only start sign-in from an HTTP 401 whose
 * `WWW-Authenticate` names a `resource_metadata` URL; that document points at
 * the authorization server, which is Supabase Auth's OAuth 2.1 server. We run
 * no authorization endpoints ourselves — only this document, the consent page
 * (`app/oauth/consent`) and token verification (`./verifyToken`).
 *
 * `resource` must be byte-identical to the URL the user pastes into the
 * connector dialog, path included, so it is built from `NEXT_PUBLIC_SITE_URL`
 * rather than from the incoming request's host (which on Vercel can be a
 * deployment URL the user never typed).
 */

export const MCP_PATH = "/api/mcp";
export const PRM_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The scopes Supabase's OAuth server issues. MCP access itself is not scoped by them. */
export const OAUTH_SCOPES_SUPPORTED = ["openid", "email", "profile"] as const;

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set");
  return stripSlash(url);
}

/** The canonical MCP URL — what users paste and what `resource` must equal. */
export function mcpResourceUrl(): string {
  return `${siteUrl()}${MCP_PATH}`;
}

/** Supabase Auth's issuer: `https://<ref>.supabase.co/auth/v1`. */
export function authIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${stripSlash(url)}/auth/v1`;
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [authIssuer()],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
    resource_name: "NoteDoctorAi",
    resource_documentation: `${siteUrl()}/api/v1/docs#mcp`,
  };
}

/**
 * The 401 challenge. Every client that can do OAuth reads `resource_metadata`;
 * a client that cannot (an API-key user with a typo) still sees a bearer realm.
 */
export function wwwAuthenticate(): string {
  const realm = 'Bearer realm="notedoctor-mcp"';
  // Never throw from the 401 path: without a site URL, fall back to the
  // API-key-only challenge rather than turning a 401 into a 500.
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return realm;
  return `${realm}, resource_metadata="${stripSlash(base)}${PRM_PATH}"`;
}
