import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionOrg, canManage } from "@/lib/api/sessionOrg";
import { invalidateApiKeyCache } from "@/lib/auth/apiKeyCache";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/keys/:id — revoke a key (soft: sets revoked_at). The key stops
 * working immediately but stays listed as "revoked" until it's deleted.
 * Scoped to the caller's org.
 */
export async function PATCH(
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
  const revoked_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at })
    .eq("id", id)
    .eq("org_id", session.orgId) // tenant guard — never revoke across orgs
    .is("revoked_at", null) // no-op if already revoked
    .select("id, key_hash")
    .maybeSingle();

  if (error) {
    console.error("Failed to revoke api_key:", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  // Awaited, not fire-and-forget: revocation must take effect before we tell
  // the caller it did, otherwise the key keeps authenticating from cache.
  await invalidateApiKeyCache(data.key_hash as string);

  return NextResponse.json({ success: true, revoked_at });
}

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
    .select("id, key_hash")
    .maybeSingle();

  if (error) {
    console.error("Failed to delete api_key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await invalidateApiKeyCache(data.key_hash as string);

  return NextResponse.json({ success: true });
}
