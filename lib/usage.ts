// lib/usage.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

export async function reportUsage({
    userId,
    quantity = 1,
    usageType,
}: {
    userId: string;
    quantity?: number;
    usageType: string;
}): Promise<Stripe.Billing.MeterEvent | null> {
    const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("stripe_customer_id, stripe_subscription_id, metered_item_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (!subscription) return null;

    const {
        stripe_customer_id,
        stripe_subscription_id,
        metered_item_id,
    } = subscription;

    if (!metered_item_id) {
        console.warn("No metered item → cannot send meter event");
        return null;
    }

    try {
        const meterEvent = await stripe.billing.meterEvents.create({
            event_name: "openai_usage", // your usage type
            payload: {
                stripe_customer_id,        // REQUIRED
                subscription_id: stripe_subscription_id,
                subscription_item_id: metered_item_id,
                value: quantity.toString(), // MUST be string
            },
        });

        console.log("✅ Meter event sent:", meterEvent.identifier);

        // optionally log to usage_logs
        await supabaseAdmin.from("usage_logs").insert({
            user_id: userId,
        usage_type: usageType,
        quantity,
        stripe_reported: true,
            stripe_usage_id: meterEvent.identifier,
    });

        return meterEvent;
    } catch (err) {
        console.error("❌ Meter event failed:", err);
        return null;
    }
}

