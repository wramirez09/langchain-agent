import { createHash, randomBytes } from "crypto";

export type ApiKeyEnvironment = "live" | "test";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Encode random bytes as a URL-safe, prefix-free base62 string. */
function base62(bytes: Buffer): string {
  let out = "";
  for (const b of bytes) out += BASE62[b % 62];
  return out;
}

/**
 * SHA-256 hex of a full API key. The plaintext is never stored — only this
 * hash lives in `api_keys.key_hash`, so the validation path hashes the
 * presented key and looks it up. Deterministic, so it doubles as the lookup key.
 */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mint a new API key. Returns the plaintext (shown to the user exactly once),
 * its hash (persisted), and a short prefix (persisted for display/listing).
 *
 * Format: `sk_<env>_<40 base62 chars>` e.g. `sk_live_a1B2c3...`.
 * The prefix is the first 12 chars (`sk_live_a1B2`), enough to disambiguate in
 * a UI without revealing the secret.
 */
export function generateApiKey(env: ApiKeyEnvironment): {
  plaintext: string;
  hash: string;
  prefix: string;
} {
  const secret = base62(randomBytes(30)); // 30 bytes -> 30 base62 chars of entropy
  const plaintext = `sk_${env}_${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}

/** True for strings shaped like one of our API keys (`sk_live_…`/`sk_test_…`). */
export function isApiKey(token: string): boolean {
  return /^sk_(live|test)_/.test(token);
}
