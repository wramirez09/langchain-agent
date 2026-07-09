// lib/usage.ts
import { getStripe } from "@/lib/stripe";
import Stripe from "stripe";
import { withRetry, RETRY_CONFIGS } from "./retry";
import { errorTracker, trackRetryError } from "./error-tracking";
import {
    getSubscriptionByUserId,
    getSubscriptionByOrgId,
    insertUsageLog,
} from "./db/repositories/usage.repo";

export async function reportUsage({
    userId,
    orgId,
    apiKeyId,
    source = "web",
    quantity = 1,
    usageType,
}: {
    userId: string;
    // When billing a tenant directly (public API), pass orgId; the meter event
    // is resolved via the org's owner subscription. Internal callers omit it and
    // bill the user's own subscription.
    orgId?: string;
    apiKeyId?: string;
    source?: "web" | "mobile" | "api";
    quantity?: number;
    usageType: string;
    }): Promise<Stripe.Billing.MeterEvent | null | undefined> {
    const stripe = getStripe();
    const subscription = orgId
        ? await getSubscriptionByOrgId(orgId)
        : await getSubscriptionByUserId(userId);

    // Attempt Stripe metering when the tenant has an active metered subscription.
    // This is decoupled from the usage_logs record below: usage is ALWAYS logged
    // regardless of whether (or if) Stripe is billed, so usage_logs reflects real
    // usage — for the /usage rollups, analytics, and quotas — not only billed events.
    let meterEvent: Stripe.Billing.MeterEvent | null = null;

    if (subscription?.metered_item_id) {
        if (!stripe) {
            const errorInfo = errorTracker.trackError(
                new Error("Stripe is not initialized"),
                "Stripe billing initialization",
                undefined,
                userId,
                undefined,
                "reportUsage-stripe-init"
            );
            console.error("❌ Stripe not initialized — usage logged but not billed:", errorInfo);
        } else {
            // Generate once outside withRetry so all retry attempts share the same key,
            // preventing Stripe from processing duplicate meter events on timeout retries.
            const idempotencyKey = `usage-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            try {
                const meterResult = await withRetry(
                    async () =>
                        stripe.billing.meterEvents.create(
                            {
                                event_name: process.env.STRIPE_METER_EVENT_NAME!,
                                payload: {
                                    stripe_customer_id: subscription.stripe_customer_id,
                                    subscription_id: subscription.stripe_subscription_id,
                                    subscription_item_id: subscription.metered_item_id!,
                                    value: quantity.toString(), // MUST be string
                                },
                            },
                            { idempotencyKey },
                        ),
                    {
                        ...RETRY_CONFIGS.EXTERNAL_API,
                        context: `Stripe billing for user ${userId}`,
                        onRetry: (attempt, error) => {
                            console.warn(`⚠️ [Stripe Billing] Retry ${attempt} for user ${userId}:`, error.message);
                        },
                    },
                );

                if (meterResult.success && meterResult.data) {
                    meterEvent = meterResult.data;
                    console.log("✅ Meter event sent:", meterEvent.identifier);
                } else {
                    throw meterResult.error || new Error("Failed to create meter event");
                }
            } catch (err) {
                // Billing failed — track it, but still record usage below.
                const errorInfo = trackRetryError(
                    err as Error,
                    "Stripe meter event creation",
                    3,
                    userId,
                    "reportUsage-meter-event"
                );
                console.error("❌ Meter event failed after retries (usage still logged):", errorInfo);
            }
        }
    } else if (subscription) {
        console.warn("No metered item → usage logged but not billed");
    }

    // Always record usage (best-effort) — the source of truth for usage.
    try {
        await withRetry(
            async () => {
                await insertUsageLog({
                    user_id: userId,
                    org_id: orgId ?? null,
                    api_key_id: apiKeyId ?? null,
                    source,
                    usage_type: usageType,
                    quantity,
                    stripe_reported: meterEvent !== null,
                    stripe_usage_id: meterEvent?.identifier ?? null,
                    metered_item_id: subscription?.metered_item_id ?? null,
                });
            },
            RETRY_CONFIGS.DATABASE,
        );
    } catch (logError) {
        console.warn("⚠️ Failed to log usage to database (non-critical):", logError);
    }

    return meterEvent;
}

