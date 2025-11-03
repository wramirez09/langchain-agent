// lib/usage.ts
import Stripe from "stripe";
import { createClient } from "app/utils/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover",
});

export async function reportUsageToStripe({
    userId,
    usageType,
    quantity = 1,
    metadata = {},
}: {
    userId: string;
    usageType: string;
    quantity?: number;
    metadata?: Record<string, any>;
}) {
    const supabase = createClient();

    const { data: subscription } = await supabase
        .from("subscriptions")
        .select("subscription_item_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

    if (!subscription?.subscription_item_id) {
        throw new Error("No active subscription item found for user");
    }

    const subscriptionItemId = subscription.subscription_item_id;

    const usageRecord = await (stripe.subscriptionItems as any).createUsageRecord(
        subscriptionItemId,
        {
            quantity,
            timestamp: Math.floor(Date.now() / 1000),
            action: "increment",
            metadata,
        }
    )

    await supabase.from("usage_logs").insert({
        user_id: userId,
        subscription_item_id: subscriptionItemId,
        usage_type: usageType,
        quantity,
        stripe_reported: true,
        stripe_usage_id: usageRecord.id,
        metadata,
    });

    return usageRecord;
}
