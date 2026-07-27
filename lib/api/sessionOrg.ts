import { createClient } from "@/utils/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OrgRole = "owner" | "admin" | "member";

export type SessionOrg = {
  userId: string;
  orgId: string;
  role: OrgRole;
};

/**
 * Resolve the signed-in user, their org, and their role from the cookie
 * session. Used by the session-authed dashboard routes. Returns null when
 * unauthenticated; throws only on the pathological "user has no org" case
 * (treat as 500). Each user belongs to exactly one org (their active org).
 */
export async function getSessionOrg(): Promise<SessionOrg | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.org_id) {
    throw new Error(`No organization found for user ${user.id}`);
  }
  return { userId: user.id, orgId: data.org_id as string, role: data.role as OrgRole };
}

/** True if the role may manage keys and members (owner or admin). */
export const canManage = (role: OrgRole) => role === "owner" || role === "admin";
