import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrg } from "@/lib/api/requireOrg";
import { canManage } from "@/lib/api/sessionOrg";
import {
  listMembers,
  findUserIdByEmail,
  getMembership,
  setMembership,
  inviteMemberByEmail,
} from "@/lib/db/repositories/org.repo";

export const dynamic = "force-dynamic";

/** GET /api/org/members — list the org's members (any member may view). */
export async function GET() {
  const s = await requireOrg();
  if (s instanceof Response) return s;

  const members = await listMembers(s.orgId);
  return NextResponse.json({ members });
}

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"), // owners are set explicitly, not via invite
});

/**
 * POST /api/org/members — add a member by email (owner/admin).
 *  - Existing account → add the membership now (moves them into this org).
 *  - No account yet   → Supabase Auth invite (creates the user + emails a
 *    set-password link); the invite-aware trigger joins them to the org on accept.
 * Each user belongs to one org.
 */
export async function POST(req: Request) {
  const s = await requireOrg();
  if (s instanceof Response) return s;
  if (!canManage(s.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = InviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, role } = parsed.data;

  const userId = await findUserIdByEmail(email);

  if (!userId) {
    // New person — invite them via Supabase Auth. They land on the app's
    // update-password page to set a password, then the trigger adds them.
    const origin =
      req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const redirectTo = origin ? `${origin}/auth/update-password` : undefined;
    const { error } = await inviteMemberByEmail(email, s.orgId, role, redirectTo);
    if (error) {
      return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
    }
    return NextResponse.json({ success: true, invited: true, email }, { status: 201 });
  }

  const existing = await getMembership(s.orgId, userId);
  if (existing) {
    return NextResponse.json({ error: "Already a member of this org" }, { status: 409 });
  }

  const { error } = await setMembership(s.orgId, userId, role);
  if (error) return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  return NextResponse.json({ success: true, user_id: userId, role }, { status: 201 });
}
