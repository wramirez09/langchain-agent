import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrg } from "@/lib/api/requireOrg";
import { canManage } from "@/lib/api/sessionOrg";
import { getMembership, updateMemberRole, removeMember, countOwners } from "@/lib/db/repositories/org.repo";

export const dynamic = "force-dynamic";

const RoleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

/** PATCH /api/org/members/:userId — change a member's role (owner only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const s = await requireOrg();
  if (s instanceof Response) return s;
  if (s.role !== "owner") {
    return NextResponse.json({ error: "Only owners can change roles" }, { status: 403 });
  }

  const { userId } = await params;
  const parsed = RoleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const current = await getMembership(s.orgId, userId);
  if (!current) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Don't strip the last owner of ownership.
  if (current === "owner" && parsed.data.role !== "owner" && (await countOwners(s.orgId)) <= 1) {
    return NextResponse.json({ error: "The org must keep at least one owner" }, { status: 409 });
  }

  const { error } = await updateMemberRole(s.orgId, userId, parsed.data.role);
  if (error) return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  return NextResponse.json({ success: true });
}

/** DELETE /api/org/members/:userId — remove a member (owner/admin). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const s = await requireOrg();
  if (s instanceof Response) return s;
  if (!canManage(s.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const current = await getMembership(s.orgId, userId);
  if (!current) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Admins may not remove owners.
  if (current === "owner" && s.role !== "owner") {
    return NextResponse.json({ error: "Admins cannot remove owners" }, { status: 403 });
  }
  // Never remove the last owner.
  if (current === "owner" && (await countOwners(s.orgId)) <= 1) {
    return NextResponse.json({ error: "The org must keep at least one owner" }, { status: 409 });
  }

  const { error } = await removeMember(s.orgId, userId);
  if (error) return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  return NextResponse.json({ success: true });
}
