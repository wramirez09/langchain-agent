import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashApiKey, isApiKey } from "@/lib/auth/apiKeys";

export type ApiAuthContext = {
  orgId: string;
  createdBy: string;
  apiKeyId: string;
  environment: "live" | "test";
  scopes: string[];
  tier: string;
};

export type ApiAuthResult =
  | { ok: true; auth: ApiAuthContext }
  | { ok: false; status: number; code: string; message: string };

const UNAUTHORIZED: ApiAuthResult = {
  ok: false,
  status: 401,
  code: "unauthorized",
  message: "Invalid or missing API key.",
};

/**
 * Authenticate a public API request by its `Authorization: Bearer sk_…` key.
 *
 * Only accepts our API keys — Supabase session/bearer tokens are rejected here,
 * keeping the public surface separate from the cookie-authed internal routes.
 * There is deliberately NO `x-dev-bypass` shortcut on this path.
 *
 * Returns a uniform 401 for every failure mode (missing/malformed/unknown/
 * revoked/expired) so the endpoint never leaks why a key was rejected.
 */
export async function resolveApiAuth(req: Request): Promise<ApiAuthResult> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return UNAUTHORIZED;

  const token = header.slice("Bearer ".length).trim();
  if (!isApiKey(token)) return UNAUTHORIZED;

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select(
      "id, org_id, created_by, environment, scopes, rate_limit_tier, revoked_at, expires_at",
    )
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();

  if (error || !data) return UNAUTHORIZED;
  if (data.revoked_at) return UNAUTHORIZED;
  if (data.expires_at && new Date(data.expires_at as string) <= new Date()) {
    return UNAUTHORIZED;
  }

  return {
    ok: true,
    auth: {
      orgId: data.org_id as string,
      createdBy: data.created_by as string,
      apiKeyId: data.id as string,
      environment: data.environment as "live" | "test",
      scopes: (data.scopes as string[]) ?? [],
      tier: (data.rate_limit_tier as string) ?? "standard",
    },
  };
}

/** Best-effort `last_used_at` bump. Call via `waitUntil()` — never await in the hot path. */
export async function touchApiKey(apiKeyId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKeyId);
  } catch {
    // non-critical; last_used_at is advisory
  }
}
