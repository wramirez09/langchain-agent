import { NextResponse } from "next/server";
import type { RateLimitResult } from "@/lib/rateLimit";

/** Public API responses must never be cached (per-key, authenticated). */
export const NO_STORE: Record<string, string> = { "cache-control": "no-store" };

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
  };
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
