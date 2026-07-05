import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrg } from "@/lib/api/requireOrg";
import { canManage } from "@/lib/api/sessionOrg";
import { listMembers, findUserIdByEmail, getMembership, setMembership } from "@/lib/db/repositories/org.repo";

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
 * POST /api/org/members — add an existing user to the org by email (owner/admin).
 * The invitee must already have an account; a full email-invite flow is a
 * follow-up. Each user belongs to one org, so this moves them into this org.
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
    return NextResponse.json(
      { error: "No account exists for that email. Ask them to sign up first." },
      { status: 404 },
    );
  }

  const existing = await getMembership(s.orgId, userId);
  if (existing) {
    return NextResponse.json({ error: "Already a member of this org" }, { status: 409 });
  }

  const { error } = await setMembership(s.orgId, userId, role);
  if (error) return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  return NextResponse.json({ success: true, user_id: userId, role }, { status: 201 });
}
