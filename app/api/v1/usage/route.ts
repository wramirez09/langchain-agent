import { NextRequest, NextResponse } from "next/server";

import { resolveApiAuth } from "@/lib/auth/resolveApiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getUsageSummaryByOrgId } from "@/lib/db/repositories/usage.repo";
import {
  apiError,
  rateLimitHeaders,
  rateLimitedResponse,
  NO_STORE,
} from "@/lib/api/publicApi";

export const dynamic = "force-dynamic";

/**
 * Per-org usage for the current calendar month (UTC): total requests plus a
 * breakdown by endpoint. API-key authed; any valid key sees its own org's usage.
 */
export async function GET(req: NextRequest) {
  const result = await resolveApiAuth(req);
  if (!result.ok) {
    return apiError(result.code, result.message, result.status);
  }
  const { orgId, apiKeyId, tier } = result.auth;

  const rl = await checkRateLimit(orgId, apiKeyId, tier);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.success) return rateLimitedResponse(rl);

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  try {
    const summary = await getUsageSummaryByOrgId(orgId, periodStart);
    return NextResponse.json(
      { period_start: periodStart, ...summary },
      { headers: { ...NO_STORE, ...rlHeaders } },
    );
  } catch {
    return apiError("internal_error", "Could not load usage.", 500, rlHeaders);
  }
}
