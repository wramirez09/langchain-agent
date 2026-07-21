import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Single source of truth for "may this user use the public API?".
 *
 * Enforcement is controlled by API_ACCESS_MODE so it can be shipped dark and
 * turned on when pricing tiers are finalized:
 *   - "open"         (default) — no gating; everyone with a dashboard can use the API
 *   - "subscription" — the user must have an active/trialing subscription
 *   - "strict"       — active subscription AND an API-enabled tier (subscriptions.api_access)
 *
 * Access is a property of each individual subscriber: every user is gated on
 * their own subscription row, regardless of any org they belong to. (Org
 * membership still scopes which keys a user can see/manage — it just no longer
 * determines API entitlement.)
 */

export type AccessReason = "ok" | "no_subscription" | "inactive" | "tier_excluded";
export type ApiAccessResult = { allowed: boolean; reason: AccessReason };

const ACTIVE = new Set(["active", "trialing"]);

function mode(): "open" | "subscription" | "strict" {
  const m = (process.env.API_ACCESS_MODE ?? "open").toLowerCase();
  return m === "subscription" || m === "strict" ? m : "open";
}

async function userSubscription(
  userId: string,
): Promise<{ status: string | null; api_access: boolean | null; tier: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, api_access, tier")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { status: string | null; api_access: boolean | null; tier: string | null }) ?? null;
}

export async function userHasApiAccess(userId: string): Promise<ApiAccessResult> {
  if (mode() === "open") return { allowed: true, reason: "ok" };

  const sub = await userSubscription(userId);
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (!ACTIVE.has(sub.status ?? "")) return { allowed: false, reason: "inactive" };
  if (mode() === "subscription") return { allowed: true, reason: "ok" };

  // strict
  return sub.api_access === true
    ? { allowed: true, reason: "ok" }
    : { allowed: false, reason: "tier_excluded" };
}
