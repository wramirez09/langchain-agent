import { NextRequest, NextResponse } from "next/server";

import { resolveApiAuth } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  apiError,
  rateLimitHeaders,
  rateLimitedResponse,
  NO_STORE,
} from "@/lib/api/publicApi";

export const dynamic = "force-dynamic";

/**
 * Key introspection. Returns the calling key's org, environment, scopes, and
 * tier — lets an integrator confirm which credentials they're using. Any valid
 * key may call it (no scope required), but it shares the org's rate limit like
 * every other endpoint: cheap for us is not the same as free, and an uncapped
 * authenticated route is an uncapped route.
 */
export async function GET(req: NextRequest) {
  const result = await resolveApiAuth(req);
  if (!result.ok) {
    return apiError(result.code, result.message, result.status);
  }
  const { orgId, apiKeyId, environment, scopes, tier } = result.auth;

  const rl = await checkRateLimit(orgId, apiKeyId, tier);
  if (!rl.success) return rateLimitedResponse(rl);

  return NextResponse.json(
    { org_id: orgId, environment, scopes, rate_limit_tier: tier },
    { headers: { ...NO_STORE, ...rateLimitHeaders(rl) } },
  );
}
