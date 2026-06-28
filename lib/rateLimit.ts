import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Durable, per-tenant rate limiting for the public API.
 *
 * Limits are enforced at the ORG level (the billing tenant) with a finer
 * per-API-key sub-limit, so one noisy key can't starve the org and one noisy
 * org can't burn shared OpenAI/SerpAPI quota. Backed by Upstash Redis so the
 * window is consistent across serverless instances.
 */

// requests / sliding window, per tier. The per-key sub-limit is a fraction of
// the org limit so a single key can't consume the whole org budget at once.
const TIER_LIMITS: Record<string, { org: number; perKey: number; windowSec: number }> = {
  standard: { org: 60, perKey: 30, windowSec: 60 },
  pro: { org: 300, perKey: 150, windowSec: 60 },
  enterprise: { org: 1200, perKey: 600, windowSec: 60 },
};

function tierConfig(tier: string) {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.standard;
}

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// One Ratelimit instance per (scope+tier+window); cached across invocations.
const limiterCache = new Map<string, Ratelimit>();
function getLimiter(name: string, limit: number, windowSec: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cacheKey = `${name}:${limit}:${windowSec}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the client may retry (only meaningful when !success). */
  retryAfterSeconds: number;
};

/**
 * Check the org + per-key limits for one request. Returns the more restrictive
 * outcome. Fails OPEN when Upstash is not configured/unreachable so a limiter
 * outage degrades to "no limiting" rather than a hard outage of a paid API.
 */
export async function checkRateLimit(
  orgId: string,
  apiKeyId: string,
  tier: string,
): Promise<RateLimitResult> {
  const cfg = tierConfig(tier);

  const orgLimiter = getLimiter("org", cfg.org, cfg.windowSec);
  const keyLimiter = getLimiter("key", cfg.perKey, cfg.windowSec);

  if (!orgLimiter || !keyLimiter) {
    console.warn("⚠️ Upstash not configured — rate limiting disabled (fail-open)");
    return { success: true, limit: cfg.org, remaining: cfg.org, retryAfterSeconds: 0 };
  }

  try {
    const [orgRes, keyRes] = await Promise.all([
      orgLimiter.limit(orgId),
      keyLimiter.limit(apiKeyId),
    ]);

    const success = orgRes.success && keyRes.success;
    const reset = Math.max(orgRes.reset, keyRes.reset);
    return {
      success,
      limit: Math.min(orgRes.limit, keyRes.limit),
      remaining: Math.min(orgRes.remaining, keyRes.remaining),
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (err) {
    console.warn("⚠️ Rate limiter error — failing open:", err);
    return { success: true, limit: cfg.org, remaining: cfg.org, retryAfterSeconds: 0 };
  }
}
