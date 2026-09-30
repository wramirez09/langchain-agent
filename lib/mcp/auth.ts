import {
  resolveApiAuth,
  type ApiAuthContext,
  type ApiAuthResult,
} from "@/lib/auth/resolveApiAuth";
import { isApiKey } from "@/lib/auth/apiKeys";

import { wwwAuthenticate } from "./oauth/metadata";
import { verifyOAuthToken } from "./oauth/verifyToken";

/**
 * Who is calling the MCP endpoint: an API key, or a user who signed in through
 * a Claude / ChatGPT connector.
 *
 * It is the REST context with `apiKeyId` widened to nullable rather than a new
 * shape, so every tool, meter and limiter works unchanged for both. An OAuth
 * caller has no key row — `usage_logs.api_key_id` is a foreign key, so it must
 * be null, never a synthetic id — and carries the OAuth client id instead.
 */
export type McpAuthContext = Omit<ApiAuthContext, "apiKeyId"> & {
  apiKeyId: string | null;
  oauthClientId?: string;
  /** Token expiry, epoch seconds. OAuth only; API keys are cached, not timed. */
  expiresAt?: number;
};

export type McpAuthResult =
  | { ok: true; auth: McpAuthContext }
  | Extract<ApiAuthResult, { ok: false }>;

/**
 * The MCP endpoint's authentication seam, branching on token shape:
 * `sk_live_` / `sk_test_` keys go through the public API's key resolution
 * unchanged; anything else is treated as a Supabase OAuth access token.
 */
export async function resolveMcpAuth(req: Request): Promise<McpAuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";

  if (!token || isApiKey(token)) return resolveApiAuth(req);
  return verifyOAuthToken(token);
}

/**
 * Rate-limit identity. API keys keep their per-key bucket; an OAuth caller is
 * bucketed per (client, user), so two connectors a user installed do not share
 * a budget and one user cannot drain another's.
 */
export function rateLimitSubject(auth: McpAuthContext): string {
  return auth.apiKeyId ?? `oauth:${auth.oauthClientId}:${auth.createdBy}`;
}

/**
 * `WWW-Authenticate` on a 401. `resource_metadata` is what starts the OAuth
 * flow in claude.ai and ChatGPT; the realm alone still tells an API-key client
 * to prompt for a token.
 */
export function mcpWwwAuthenticate(): string {
  return wwwAuthenticate();
}
