import { NextRequest, NextResponse } from "next/server";

import { resolveApiAuth } from "@/lib/auth/resolveApiAuth";
import { apiError, NO_STORE } from "@/lib/api/publicApi";

export const dynamic = "force-dynamic";

/**
 * Key introspection. Returns the calling key's org, environment, scopes, and
 * tier — lets an integrator confirm which credentials they're using. Any valid
 * key may call it (no scope required); no rate limit needed for a trivial read.
 */
export async function GET(req: NextRequest) {
  const result = await resolveApiAuth(req);
  if (!result.ok) {
    return apiError(result.code, result.message, result.status);
  }
  const { orgId, environment, scopes, tier } = result.auth;

  return NextResponse.json(
    { org_id: orgId, environment, scopes, rate_limit_tier: tier },
    { headers: NO_STORE },
  );
}
