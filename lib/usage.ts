// lib/usage.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

async function logUsageToSupabase({
    userId,
    quantity = 1,
    usageType,
    meterEvent,
}: {
    userId: string;
    quantity?: number;
    usageType: string;
    meterEvent: Stripe.Billing.MeterEvent;
}) {
    try {
        // log to usage_logs
        await supabaseAdmin.from("usage_logs").insert({
            user_id: userId,
            usage_type: usageType,
            quantity,
            stripe_reported: true,
            stripe_usage_id: meterEvent.identifier,
        });
        console.log("✅ Meter event sent to supabase:", meterEvent.identifier, usageType);
    } catch (err) {
        console.error("❌ Meter event failed:", err);
    }
}

export async function reportUsageToStripe({
    userId,
    quantity = 1,
    usageType,
}: {
    userId: string;
    quantity?: number;
    usageType: string;
}) {
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
            event_name: process.env.STRIPE_EVENT_NAME ?? "openai_usage"!,
            payload: {
                stripe_customer_id,        // REQUIRED
                subscription_id: stripe_subscription_id,
                subscription_item_id: metered_item_id,
                value: quantity.toString(), // MUST be string
            },
        });

        if (meterEvent) console.log("event sent to stripe", { meterEvent })


        logUsageToSupabase({
            userId,
            quantity,
            usageType,
            meterEvent,
        });

        return meterEvent;
    } catch (err) {
        console.error("❌ Meter event failed:", err);
        return null;
    }



}



