import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashApiKey, isApiKey } from "@/lib/auth/apiKeys";
import {
  readApiKeyCache,
  writeApiKeyCache,
  writeApiKeyMiss,
} from "@/lib/auth/apiKeyCache";
import { getRedis } from "@/lib/redis";

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
 *
 * Backed by a short-lived Redis cache (see `apiKeyCache`) so the common path
 * costs no Supabase round-trip; Postgres remains the source of truth and any
 * cache failure falls through to it.
 */
export async function resolveApiAuth(req: Request): Promise<ApiAuthResult> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return UNAUTHORIZED;

  const token = header.slice("Bearer ".length).trim();
  if (!isApiKey(token)) return UNAUTHORIZED;

  const keyHash = hashApiKey(token);

  const cached = await readApiKeyCache(keyHash);
  if (cached.status === "hit") return { ok: true, auth: cached.auth };
  if (cached.status === "known-invalid") return UNAUTHORIZED;

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select(
      "id, org_id, created_by, environment, scopes, rate_limit_tier, revoked_at, expires_at",
    )
    .eq("key_hash", keyHash)
    .maybeSingle();

  // Only cache a decision we actually made. A transport `error` means we don't
  // know, so reject this request but leave the cache cold for the next one.
  if (error) return UNAUTHORIZED;

  const expiresAt = (data?.expires_at as string | null) ?? null;
  const rejected =
    !data || data.revoked_at || (expiresAt && new Date(expiresAt) <= new Date());

  if (rejected) {
    await writeApiKeyMiss(keyHash);
    return UNAUTHORIZED;
  }

  const auth: ApiAuthContext = {
    orgId: data.org_id as string,
    createdBy: data.created_by as string,
    apiKeyId: data.id as string,
    environment: data.environment as "live" | "test",
    scopes: (data.scopes as string[]) ?? [],
    tier: (data.rate_limit_tier as string) ?? "standard",
  };

  await writeApiKeyCache(keyHash, auth, expiresAt);
  return { ok: true, auth };
}

/**
 * Best-effort `last_used_at` bump. Call via `waitUntil()` — never await in the
 * hot path. Throttled through Redis to at most one write per key per minute:
 * `last_used_at` is advisory, and at full rate-limit tier an unthrottled bump
 * would be a Postgres write on every single request.
 */
export async function touchApiKey(apiKeyId: string): Promise<void> {
  if (!(await shouldTouch(apiKeyId))) return;
  try {
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKeyId);
  } catch {
    // non-critical; last_used_at is advisory
  }
}

const TOUCH_INTERVAL_SECONDS = 60;

/**
 * Claim the once-per-minute write slot for a key via `SET NX EX`. Returns true
 * when this request won the slot. Without Redis, every call writes (previous
 * behaviour); on a Redis error we also write rather than silently skip.
 */
async function shouldTouch(apiKeyId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const claimed = await redis.set(`apikey:touched:${apiKeyId}`, 1, {
      ex: TOUCH_INTERVAL_SECONDS,
      nx: true,
    });
    return claimed === "OK";
  } catch {
    return true;
  }
}
