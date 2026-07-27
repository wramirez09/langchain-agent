import { NextResponse } from "next/server";
import type { RateLimitResult } from "@/lib/rateLimit";

/** Public API responses must never be cached (per-key, authenticated). */
export const NO_STORE: Record<string, string> = { "cache-control": "no-store" };

/**
 * Standard rate-limit headers for every public API response — sent on success
 * as well as on 429 so integrators can back off before they get throttled.
 * `X-RateLimit-Reset` is unix seconds (the convention Stripe/GitHub use).
 * On a 429 the same result also carries `Retry-After` in whole seconds.
 */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
    "X-RateLimit-Reset": String(r.resetAtSeconds),
  };
  if (!r.success) headers["Retry-After"] = String(r.retryAfterSeconds);
  return headers;
}

/** The uniform 429 every public route returns. Headers already include Retry-After. */
export function rateLimitedResponse(r: RateLimitResult): Response {
  return apiError("rate_limited", "Rate limit exceeded.", 429, rateLimitHeaders(r));
}

/**
 * Uniform public-API error envelope: `{ error: { code, message, requestId } }`.
 * Always no-store; merges any extra headers (e.g. Retry-After, rate-limit).
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {},
  requestId: string | null = null,
): Response {
  return NextResponse.json(
    { error: { code, message, requestId } },
    { status, headers: { ...NO_STORE, ...extraHeaders } },
  );
}
