import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrg } from "@/lib/api/requireOrg";
import { canManage } from "@/lib/api/sessionOrg";
import { getOrg, updateOrgName } from "@/lib/db/repositories/org.repo";

export const dynamic = "force-dynamic";

/** GET /api/org — the caller's org profile + their role. */
export async function GET() {
  const s = await requireOrg();
  if (s instanceof Response) return s;

  const org = await getOrg(s.orgId);
  return NextResponse.json({ org, role: s.role, userId: s.userId });
}

const PatchSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** PATCH /api/org — rename the org (owner/admin only). */
export async function PATCH(req: Request) {
  const s = await requireOrg();
  if (s instanceof Response) return s;
  if (!canManage(s.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await updateOrgName(s.orgId, parsed.data.name);
  if (error) return NextResponse.json({ error: "Failed to update org" }, { status: 500 });
  return NextResponse.json({ success: true });
}
