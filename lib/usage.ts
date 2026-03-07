// lib/usage.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import Stripe from "stripe";
import { withRetry, RETRY_CONFIGS } from "./retry";
import { errorTracker, trackRetryError } from "./error-tracking";
import { cache } from "./cache";

const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function reportUsage({
    userId,
    quantity = 1,
    usageType,
    metadata,
}: {
    userId: string;
    quantity?: number;
    usageType: string;
    metadata?: Record<string, unknown>;
}): Promise<Stripe.Billing.MeterEvent | null | undefined> {
    const stripe = getStripe();

    const cacheKey = `subscription:${userId}`;
    let subscription = cache.get<{ stripe_customer_id: string; stripe_subscription_id: string; metered_item_id: string }>(cacheKey);

    if (!subscription) {
        const { data } = await supabaseAdmin
            .from("subscriptions")
            .select("stripe_customer_id, stripe_subscription_id, metered_item_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (!data) return null;
        subscription = data;
        cache.set(cacheKey, subscription, SUBSCRIPTION_CACHE_TTL);
    }

    if (!subscription) return null;

    const {
        stripe_customer_id,
        metered_item_id,
    } = subscription;

    if (!metered_item_id) {
        console.warn("No metered item → cannot send meter event");
        return null;
    }

    if (!stripe) {
        const error = new Error("Stripe is not initialized");
        const errorInfo = errorTracker.trackError(
            error,
            "Stripe billing initialization",
            undefined,
            userId,
            undefined,
            "reportUsage-stripe-init"
        );
        console.error("❌ Stripe not initialized:", errorInfo);
        return null;
    }

    try {
        const meterResult = await withRetry(
            async () => {
                const event = await stripe.billing.meterEvents.create({
                    event_name: process.env.STRIPE_METER_EVENT_NAME!,
                    payload: {
                        stripe_customer_id,        // REQUIRED
                        value: quantity.toString(), // REQUIRED — must be a string
                    },
                });
                return event;
            },
            {
                ...RETRY_CONFIGS.EXTERNAL_API,
                context: `Stripe billing for user ${userId}`,
                onRetry: (attempt, error) => {
                    console.warn(`⚠️ [Stripe Billing] Retry ${attempt} for user ${userId}:`, error.message);
                }
            }
        );

        if (!meterResult.success || !meterResult.data) {
            throw meterResult.error || new Error("Failed to create meter event");
        }

        const meterEvent = meterResult.data;

        console.log("✅ Meter event sent:", meterEvent.identifier);

        // Log to usage_logs — check for Supabase-level errors
        try {
            const logResult = await withRetry(
                async () => {
                    const { error } = await supabaseAdmin.from("usage_logs").insert({
                        user_id: userId,
                        usage_type: usageType,
                        quantity,
                        stripe_reported: true,
                        stripe_usage_id: meterEvent.identifier,
                        ...(metadata ? { metadata } : {}),
                    });
                    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
                },
                RETRY_CONFIGS.DATABASE
            );
            if (!logResult.success) {
                console.warn("⚠️ Failed to log usage to database (non-critical):", logResult.error?.message);
            }
        } catch (logError) {
            console.warn("⚠️ Failed to log usage to database (non-critical):", logError);
        }

        return meterEvent;
    } catch (err) {
        const errorInfo = trackRetryError(
            err as Error,
            "Stripe meter event creation",
            3, // Max attempts from retry
            userId,
            "reportUsage-meter-event"
        );
        console.error("❌ Meter event failed after retries:", errorInfo);
        return null;
    }
}

