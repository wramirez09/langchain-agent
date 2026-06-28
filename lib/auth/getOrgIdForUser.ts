import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Resolve the active organization for a user. Every user is backfilled into
 * exactly one org (as owner) and a trigger creates one for every new auth.users
 * row, so this returns a single id today. When team seats land (multiple orgs
 * per user), this becomes the place to apply the "active org" selection.
 *
 * Returns null only in the pathological case where the org backfill/trigger
 * did not run for this user — callers should treat that as a 500, not a 401.
 */
export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.org_id as string) ?? null;
}
