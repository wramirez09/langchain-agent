import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Single source of truth for "may this org use the public API?".
 *
 * Enforcement is controlled by API_ACCESS_MODE so it can be shipped dark and
 * turned on when pricing tiers are finalized:
 *   - "open"         (default) — no gating; everyone with a dashboard can use the API
 *   - "subscription" — org's owner must have an active/trialing subscription
 *   - "strict"       — active subscription AND an API-enabled tier (subscriptions.api_access)
 *
 * The org abstraction unifies individual and org-level subscribers: an
 * individual is simply the sole member of their own org, so access is always a
 * property of the org's owner subscription.
 */

export type AccessReason = "ok" | "no_subscription" | "inactive" | "tier_excluded";
export type ApiAccessResult = { allowed: boolean; reason: AccessReason };

const ACTIVE = new Set(["active", "trialing"]);

function mode(): "open" | "subscription" | "strict" {
  const m = (process.env.API_ACCESS_MODE ?? "open").toLowerCase();
  return m === "subscription" || m === "strict" ? m : "open";
}

async function ownerSubscription(
  orgId: string,
): Promise<{ status: string | null; api_access: boolean | null; tier: string | null } | null> {
  const { data: owner } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .maybeSingle();
  if (!owner?.user_id) return null;

  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, api_access, tier")
    .eq("user_id", owner.user_id as string)
    .maybeSingle();
  return (data as { status: string | null; api_access: boolean | null; tier: string | null }) ?? null;
}

export async function orgHasApiAccess(orgId: string): Promise<ApiAccessResult> {
  if (mode() === "open") return { allowed: true, reason: "ok" };

  const sub = await ownerSubscription(orgId);
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (!ACTIVE.has(sub.status ?? "")) return { allowed: false, reason: "inactive" };
  if (mode() === "subscription") return { allowed: true, reason: "ok" };

  // strict
  return sub.api_access === true
    ? { allowed: true, reason: "ok" }
    : { allowed: false, reason: "tier_excluded" };
}
