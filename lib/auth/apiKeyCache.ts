import { getRedis } from "@/lib/redis";
import type { ApiAuthContext } from "@/lib/auth/resolveApiAuth";

/**
 * Redis-backed cache for API-key lookups.
 *
 * Every public API request otherwise costs a Supabase round-trip just to
 * resolve `Authorization: Bearer sk_…` into an org. Keys change rarely, so we
 * cache the resolved context (never the plaintext key — the cache is keyed by
 * the same SHA-256 hash the DB stores) for a short TTL.
 *
 * Correctness rules:
 *  - Postgres stays the source of truth. Any Redis failure falls through to it.
 *  - Revoking or deleting a key invalidates its entry explicitly
 *    (`invalidateApiKeyCache`), so revocation is effectively immediate rather
 *    than TTL-bound. The TTL is only the backstop for edits we don't intercept.
 *  - `expires_at` is stored and re-checked on every read, so an expiry that
 *    falls inside a cached window is still honoured.
 *  - Misses are cached too (shorter TTL): an invalid key is the common
 *    brute-force shape, and auth runs before rate limiting, so without this a
 *    credential-stuffing run would hammer Supabase. A hash that is unknown now
 *    cannot become valid within the TTL — new keys mint fresh random secrets.
 */

const PREFIX = "apikey:v1:";
const HIT_TTL_SECONDS = 60;
const MISS_TTL_SECONDS = 30;

/** What we persist: the auth context plus the fields we must re-verify. */
type CachedEntry =
  | { found: false }
  | { found: true; auth: ApiAuthContext; expiresAt: string | null };

export type ApiKeyCacheLookup =
  | { status: "hit"; auth: ApiAuthContext }
  | { status: "known-invalid" }
  | { status: "miss" };

function cacheKey(keyHash: string): string {
  return `${PREFIX}${keyHash}`;
}

/**
 * Look up a key hash. `miss` means "ask Postgres" — it is returned both for a
 * cold cache and for any Redis error, so the caller never has to distinguish
 * "unavailable" from "not cached".
 */
export async function readApiKeyCache(keyHash: string): Promise<ApiKeyCacheLookup> {
  const redis = getRedis();
  if (!redis) return { status: "miss" };

  let entry: CachedEntry | null;
  try {
    entry = await redis.get<CachedEntry>(cacheKey(keyHash));
  } catch (err) {
    console.warn("⚠️ API key cache read failed — falling back to Postgres:", err);
    return { status: "miss" };
  }

  if (!entry) return { status: "miss" };
  if (!entry.found) return { status: "known-invalid" };

  // Expiry can land mid-TTL; re-check rather than trusting the cached decision.
  if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
    return { status: "known-invalid" };
  }
  return { status: "hit", auth: entry.auth };
}

/** Cache a successful lookup. Best-effort — a write failure is not an error. */
export async function writeApiKeyCache(
  keyHash: string,
  auth: ApiAuthContext,
  expiresAt: string | null,
): Promise<void> {
  await write(keyHash, { found: true, auth, expiresAt }, HIT_TTL_SECONDS);
}

/** Cache a rejected lookup (unknown/revoked/expired key). Best-effort. */
export async function writeApiKeyMiss(keyHash: string): Promise<void> {
  await write(keyHash, { found: false }, MISS_TTL_SECONDS);
}

async function write(keyHash: string, entry: CachedEntry, ttl: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(keyHash), entry, { ex: ttl });
  } catch (err) {
    console.warn("⚠️ API key cache write failed (non-fatal):", err);
  }
}

/**
 * Drop a key's cached entry. Call on revoke and on delete so the key stops
 * authenticating immediately instead of after the TTL. Best-effort: if Redis
 * is down the entry still expires on its own within `HIT_TTL_SECONDS`.
 */
export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(cacheKey(keyHash));
  } catch (err) {
    console.warn("⚠️ API key cache invalidation failed:", err);
  }
}
