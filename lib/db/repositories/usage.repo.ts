import type { SupabaseClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export type UsageLogPayload = {
  user_id: string
  usage_type: string
  quantity: number
  stripe_reported: boolean
  stripe_usage_id?: string | null
  metered_item_id?: string | null
  subscription_item_id?: string | null
  metadata?: Record<string, unknown>
  // Multi-tenant attribution. `org_id` is the billing tenant; `source`
  // distinguishes first-party clients from public API-key traffic.
  org_id?: string | null
  api_key_id?: string | null
  source?: "web" | "mobile" | "api"
}

export type Subscription = {
  stripe_customer_id: string
  stripe_subscription_id: string
  metered_item_id: string | null
}

export async function insertUsageLog(
  payload: UsageLogPayload,
  client: SupabaseClient = supabaseAdmin,
) {
  return client.from("usage_logs").insert(payload)
}

export async function getSubscriptionByUserId(
  userId: string,
): Promise<Subscription | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, metered_item_id")
    .eq("user_id", userId)
    .maybeSingle()

  return (data as Subscription) ?? null
}

/**
 * Resolve the metered subscription for a tenant. Billing hangs off the org's
 * owner: org → owner membership → that user's Stripe subscription. Keeps the
 * existing per-user `subscriptions` table and the Stripe webhook untouched.
 */
export async function getSubscriptionByOrgId(
  orgId: string,
): Promise<Subscription | null> {
  const { data: owner } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .maybeSingle()

  if (!owner?.user_id) return null

  return getSubscriptionByUserId(owner.user_id as string)
}
