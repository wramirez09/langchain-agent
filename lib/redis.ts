import { Redis } from "@upstash/redis";

/**
 * Single shared Upstash Redis client for the public API.
 *
 * Everything that touches Redis (rate limiting, the API-key auth cache,
 * idempotency) goes through here so there is one connection config and one
 * place that decides what happens when Upstash isn't configured: we return
 * `null` and every caller degrades gracefully rather than throwing. Redis is a
 * performance and safety layer here, never the source of truth.
 */

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

/** True when Upstash credentials are present. */
export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/** Test seam — drop the memoized client so env changes take effect. */
export function resetRedisForTests(): void {
  client = null;
}
