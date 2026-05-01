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
