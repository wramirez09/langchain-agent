import { createClient } from "@/utils/server";
import { getOrgIdForUser } from "@/lib/auth/getOrgIdForUser";

/**
 * Resolve the signed-in user and their org from the cookie session. Used by the
 * session-authed key-management routes. Returns null when unauthenticated;
 * throws only on the pathological "user has no org" case (treat as 500).
 */
export async function getSessionOrg(): Promise<
  { userId: string; orgId: string } | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    throw new Error(`No organization found for user ${user.id}`);
  }
  return { userId: user.id, orgId };
}
