import type { ApiAuthResult } from "@/lib/auth/resolveApiAuth";

import type { McpAuthResult } from "../auth";
import { authIssuer } from "./metadata";

const UNAUTHORIZED: Extract<ApiAuthResult, { ok: false }> = {
  ok: false,
  status: 401,
  code: "unauthorized",
  message: "Invalid or missing access token.",
};

/**
 * Verify an OAuth access token issued by Supabase Auth's OAuth 2.1 server.
 *
 * Supabase issues these as ordinary user JWTs (`aud: "authenticated"`), so the
 * audience cannot tell a connector token from a web-session token. What can is
 * the `client_id` claim, present only on tokens minted through the OAuth
 * server: requiring it keeps a stolen browser session JWT from working here,
 * and pinning `iss` keeps any other Supabase project's tokens out.
 *
 * An OAuth caller gets the same capabilities an API key with the default
 * scopes has — the consent page is where the user granted that — and is billed
 * and rate-limited to the user's own org.
 */
export async function verifyOAuthToken(token: string): Promise<McpAuthResult> {
  // Lazy: `supabaseAdmin` throws at import time without a service-role key,
  // and `lib/mcp/auth` is imported by every request's route module.
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  let claims: Record<string, unknown> | undefined;
  try {
    // Verifies the signature (JWKS for asymmetric keys, else a round trip to
    // Auth) and rejects an expired token.
    const { data, error } = await supabaseAdmin.auth.getClaims(token);
    if (error || !data) return UNAUTHORIZED;
    claims = data.claims as Record<string, unknown>;
  } catch {
    return UNAUTHORIZED;
  }

  const sub = claims.sub;
  const clientId = claims.client_id;
  const exp = claims.exp;
  if (claims.iss !== authIssuer()) return UNAUTHORIZED;
  if (typeof sub !== "string" || !sub) return UNAUTHORIZED;
  if (typeof clientId !== "string" || !clientId) return UNAUTHORIZED;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) return UNAUTHORIZED;

  const { getOrgIdForUser } = await import("@/lib/auth/getOrgIdForUser");
  const orgId = await getOrgIdForUser(sub);
  // Every user has an org (a trigger creates one), so a miss is a data fault;
  // still refuse rather than run unbilled.
  if (!orgId) return UNAUTHORIZED;

  return {
    ok: true,
    auth: {
      orgId,
      createdBy: sub,
      apiKeyId: null,
      oauthClientId: clientId,
      expiresAt: exp,
      environment: "live",
      scopes: ["agents", "chat"],
      tier: "standard",
    },
  };
}
