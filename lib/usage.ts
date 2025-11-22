// lib/usage.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

/**
 * Report a single unit of metered usage for a user.
 *
 * Stripe's new SDK no longer supports:
 *   - stripe.subscriptionItems.createUsageRecord()
 *   - stripe.request()
 *
 * So we manually POST to:
 *   POST https://api.stripe.com/v1/subscription_items/{itemId}/usage_records
 */
export async function reportUsageToStripe({
    userId,
    usageType,
    quantity = 1,

}: {
        userId: string;
        usageType: string;
        quantity?: number;

}) {
    console.log("📡 Reporting usage for user:", userId);

    // ------------------------------------------------------------------------------------
    // 1) Fetch subscription row (service role bypasses RLS)
    // ------------------------------------------------------------------------------------
    const { data: subscription, error: subErr } = await supabaseAdmin
        .from("subscriptions")
        .select("subscription_item_id, stripe_subscription_id, status")
        .eq("user_id", userId)
        .in("status", ["active", "trialing"])
        .maybeSingle();

    if (subErr) {
        console.error("❌ Error reading subscriptions table:", subErr);
        return null;
    }

    console.log("Subscription row:", subscription);

    let itemId = subscription?.subscription_item_id ?? null;

    // ------------------------------------------------------------------------------------
    // 2) Backfill subscription item ID if missing
    // ------------------------------------------------------------------------------------
    if (!itemId && subscription?.stripe_subscription_id) {
        try {
            const subs = await stripe.subscriptions.retrieve(
                subscription.stripe_subscription_id,
                { expand: ["items"] }
            );

            itemId = subs.items.data[0]?.id;
            console.log("🔁 Backfilled subscription_item_id:", itemId);

            if (itemId) {
                await supabaseAdmin
                    .from("subscriptions")
                    .update({
                        subscription_item_id: itemId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", userId);
            }
        } catch (err) {
            console.error("❌ Stripe subscription retrieve failed:", err);
        }
    }

    // ------------------------------------------------------------------------------------
    // 3) If STILL no itemId → cannot report usage
    // ------------------------------------------------------------------------------------
    if (!itemId) {
        console.warn(
            "⚠️ Cannot report usage — subscription item not found for user:",
            userId
        );
        return null;
    }

    // ------------------------------------------------------------------------------------
    // 4) Create usage record — RAW HTTP REQUEST (required with latest SDK)
    // ------------------------------------------------------------------------------------
    let usageRecord: any = null;

    try {
        const formBody = new URLSearchParams();
        formBody.append("quantity", quantity.toString());
        formBody.append("timestamp", Math.floor(Date.now() / 1000).toString());
        formBody.append("action", "increment");

        const response = await fetch(
            `https://api.stripe.com/v1/subscription_items/${itemId}/usage_records`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: formBody.toString(),
            }
        );

        usageRecord = await response.json();

        if (!response.ok) {
            console.error("❌ Stripe usage record HTTP error:", usageRecord);
            return null;
        }

        console.log("✅ Stripe usage record created:", usageRecord.id);
    } catch (err) {
        console.error("❌ Stripe usage record request failed:", err);
        return null;
    }

    // ------------------------------------------------------------------------------------
    // 5) Log the usage in Supabase
    // ------------------------------------------------------------------------------------
    try {
        const { error: logErr } = await supabaseAdmin.from("usage_logs").insert({
            user_id: userId,
            subscription_item_id: itemId,
        usage_type: usageType,
        quantity,
        stripe_reported: true,
        stripe_usage_id: usageRecord.id,

    });

        if (logErr) {
            console.error("❌ Failed writing to usage_logs table:", logErr);
        }
    } catch (err) {
        console.error("❌ Exception writing to usage_logs:", err);
    }

    return usageRecord;
}
