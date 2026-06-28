import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionOrg } from "@/lib/api/sessionOrg";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/keys/:id — revoke a key (soft delete via revoked_at).
 * Scoped to the caller's org so a user can't revoke another tenant's key.
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

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", session.orgId) // tenant guard — never revoke across orgs
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to revoke api_key:", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
