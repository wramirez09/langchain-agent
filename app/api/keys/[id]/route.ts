import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionOrg, canManage } from "@/lib/api/sessionOrg";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/keys/:id — permanently delete a key. Scoped to the caller's org
 * so a user can't delete another tenant's key. usage_logs rows that referenced
 * it keep their org attribution (the api_key_id FK is ON DELETE SET NULL).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await getSessionOrg();
  } catch {
    return NextResponse.json({ error: "No organization for user" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("org_id", session.orgId) // tenant guard — never delete across orgs
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to delete api_key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
