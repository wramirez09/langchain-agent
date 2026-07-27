import { NextResponse } from "next/server";

import { requireOrg } from "@/lib/api/requireOrg";
import { getUsageSummaryByOrgId } from "@/lib/db/repositories/usage.repo";

export const dynamic = "force-dynamic";

/** GET /api/org/usage — current-month usage rollup for the caller's org (any member). */
export async function GET() {
  const s = await requireOrg();
  if (s instanceof Response) return s;

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  try {
    const summary = await getUsageSummaryByOrgId(s.orgId, periodStart);
    return NextResponse.json({ period_start: periodStart, ...summary });
  } catch {
    return NextResponse.json({ error: "Could not load usage" }, { status: 500 });
  }
}
