import { supabaseAdmin } from "@/lib/supabaseAdmin"
import type { OrgRole } from "@/lib/api/sessionOrg"

export type OrgMember = {
  user_id: string
  email: string | null
  role: OrgRole
  created_at: string
}

/**
 * Map of user id -> email, from the auth admin API. Emails live in auth.users,
 * which PostgREST doesn't expose, so we read them through the admin API. Fine
 * for the small member lists an org has; revisit if orgs grow large.
 */
async function emailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email) map.set(u.id, u.email)
  }
  return map
}

export async function getOrg(orgId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle()
  return (data as { id: string; name: string }) ?? null
}

export async function updateOrgName(orgId: string, name: string) {
  return supabaseAdmin.from("organizations").update({ name }).eq("id", orgId)
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  const rows = (data as { user_id: string; role: OrgRole; created_at: string }[]) ?? []
  if (rows.length === 0) return []

  const emails = await emailMap()
  return rows.map((r) => ({
    user_id: r.user_id,
    email: emails.get(r.user_id) ?? null,
    role: r.role,
    created_at: r.created_at,
  }))
}

/**
 * Invite a brand-new user by email via Supabase Auth. Creates the auth.users
 * row and emails a set-password link. The `invited_org_id`/`invited_role`
 * metadata is read by the handle_new_user_org trigger, which joins them to the
 * org (instead of creating a solo org) once they accept.
 */
export async function inviteMemberByEmail(
  email: string,
  orgId: string,
  role: OrgRole,
  redirectTo?: string,
) {
  return supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { invited_org_id: orgId, invited_role: role },
    redirectTo,
  })
}

/** Look up an existing user id by email (case-insensitive). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase()
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const match = (data?.users ?? []).find((u) => u.email?.toLowerCase() === target)
  return match?.id ?? null
}

export async function getMembership(orgId: string, userId: string): Promise<OrgRole | null> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()
  return (data?.role as OrgRole) ?? null
}

/** Move a user into this org (each user belongs to exactly one org). */
export async function setMembership(orgId: string, userId: string, role: OrgRole) {
  // Clear any prior membership so the user has a single active org, then add.
  await supabaseAdmin.from("organization_members").delete().eq("user_id", userId)
  return supabaseAdmin
    .from("organization_members")
    .insert({ org_id: orgId, user_id: userId, role })
}

export async function updateMemberRole(orgId: string, userId: string, role: OrgRole) {
  return supabaseAdmin
    .from("organization_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId)
}

export async function removeMember(orgId: string, userId: string) {
  return supabaseAdmin
    .from("organization_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId)
}

export async function countOwners(orgId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner")
  return count ?? 0
}
