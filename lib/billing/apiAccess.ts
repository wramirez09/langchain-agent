import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Single source of truth for "may this user use the public API?".
 *
 * The product decision is deliberately flat: **every subscriber gets the API**.
 * An active (or trialing) subscription grants both the API endpoints and the
 * key-management UI — there is no separate API add-on, no per-tier entitlement,
 * and no environment switch that can silently un-gate a paid surface.
 *
 * Access is a property of the individual subscriber: each user is gated on
 * their own subscription row, regardless of any org they belong to. (Org
 * membership still scopes which keys a user can see and manage — it just
 * doesn't determine entitlement.)
 *
 * Note for anyone reading `subscriptions.api_access` / `.tier`: the Stripe
 * webhook still records those from plan metadata, but nothing reads them for
 * entitlement any more. `tier` remains useful if rate-limit tiers are ever
 * driven off the purchased plan.
 */

export type AccessReason = "ok" | "no_subscription" | "inactive";
export type ApiAccessResult = { allowed: boolean; reason: AccessReason };

/** Stripe statuses that count as a live subscription. */
const ACTIVE = new Set(["active", "trialing"]);

async function userSubscription(
  userId: string,
): Promise<{ status: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { status: string | null }) ?? null;
}

export async function userHasApiAccess(userId: string): Promise<ApiAccessResult> {
  const sub = await userSubscription(userId);
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (!ACTIVE.has(sub.status ?? "")) return { allowed: false, reason: "inactive" };
  return { allowed: true, reason: "ok" };
}
