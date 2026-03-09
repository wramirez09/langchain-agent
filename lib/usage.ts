// lib/usage.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import Stripe from "stripe";
import { withRetry, RETRY_CONFIGS } from "./retry";
import { errorTracker, trackRetryError } from "./error-tracking";

export async function reportUsage({
    userId,
    quantity = 1,
    usageType,
}: {
    userId: string;
    quantity?: number;
    usageType: string;
    }): Promise<Stripe.Billing.MeterEvent | null | undefined> {
    const stripe = getStripe();
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

    // Generate once outside withRetry so all retry attempts share the same key,
    // preventing Stripe from processing duplicate meter events on timeout retries.
    const idempotencyKey = `usage-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
        const meterResult = await withRetry(
            async () => {
                const event = await stripe.billing.meterEvents.create(
                    {
                        event_name: process.env.STRIPE_METER_EVENT_NAME!, // your usage type
                        payload: {
                            stripe_customer_id,        // REQUIRED
                            subscription_id: stripe_subscription_id,
                            subscription_item_id: metered_item_id,
                            value: quantity.toString(), // MUST be string
                        },
                    },
                    { idempotencyKey },
                );
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

        // optionally log to usage_logs with retry
        try {
            await withRetry(
                async () => {
                    await supabaseAdmin.from("usage_logs").insert({
                        user_id: userId,
                        usage_type: usageType,
                        quantity,
                        stripe_reported: true,
                        stripe_usage_id: meterEvent.identifier,
                    });
                },
                RETRY_CONFIGS.DATABASE
            );
        } catch (logError) {
            console.warn("⚠️ Failed to log usage to database (non-critical):", logError);
            // Don't fail the operation if logging fails
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

