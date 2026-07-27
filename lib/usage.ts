// lib/usage.ts
import { getStripe } from "@/lib/stripe";
import Stripe from "stripe";
import { withRetry, RETRY_CONFIGS } from "./retry";
import { errorTracker, trackRetryError } from "./error-tracking";
import {
    getSubscriptionByUserId,
    insertUsageLog,
} from "./db/repositories/usage.repo";

export async function reportUsage({
    userId,
    orgId,
    apiKeyId,
    source = "web",
    quantity = 1,
    usageType,
    environment = "live",
}: {
    userId: string;
    // Attribution only — recorded on the usage_logs row so /usage can roll up
    // per org. It deliberately does NOT select the billing subject: usage is
    // always billed to `userId`'s own subscription (see below).
    orgId?: string;
    apiKeyId?: string;
    source?: "web" | "mobile" | "api";
    quantity?: number;
    usageType: string;
    // Environment of the API key that made the call. `test` keys are served
    // exactly like live ones (same data, same models, same rate limits) but are
    // never metered to Stripe. Defaults to "live" so first-party web/mobile
    // traffic — and any caller that forgets to pass it — still bills.
    environment?: "live" | "test";
    }): Promise<Stripe.Billing.MeterEvent | null | undefined> {
    const stripe = getStripe();
    const isTest = environment === "test";

    // Bill the same person we gate. Entitlement is per-user
    // (`userHasApiAccess(created_by)`), so billing must resolve the same way —
    // this previously resolved the ORG OWNER's subscription when an orgId was
    // passed, which meant a subscribing member passed the gate while their
    // usage metered to someone else's subscription (or to nothing at all).
    // Test keys skip the subscription lookup entirely — nothing downstream of
    // it is used when we are not going to meter.
    const subscription = isTest ? null : await getSubscriptionByUserId(userId);

    // Attempt Stripe metering when the tenant has an active metered subscription.
    // This is decoupled from the usage_logs record below: usage is ALWAYS logged
    // regardless of whether (or if) Stripe is billed, so usage_logs reflects real
    // usage — for the /usage rollups, analytics, and quotas — not only billed events.
    let meterEvent: Stripe.Billing.MeterEvent | null = null;

    // Misconfiguration here is silent revenue loss: a billable request is served,
    // logged, and never invoiced. Fail loudly rather than posting an event Stripe
    // will reject — `event_name` was previously a bare `!` assertion, so an unset
    // var meant one rejected API call per request with nothing naming the cause.
    const meterEventName = process.env.STRIPE_METER_EVENT_NAME;

    if (subscription?.metered_item_id) {
        if (!stripe || !meterEventName) {
            const cause = !stripe
                ? "Stripe is not initialized"
                : "STRIPE_METER_EVENT_NAME is not set";
            const errorInfo = errorTracker.trackError(
                new Error(cause),
                "Stripe billing configuration",
                undefined,
                userId,
                undefined,
                "reportUsage-stripe-config"
            );
            console.error(`❌ ${cause} — usage logged but NOT BILLED:`, errorInfo);
        } else {
            // Generate once outside withRetry so all retry attempts share the same key,
            // preventing Stripe from processing duplicate meter events on timeout retries.
            const idempotencyKey = `usage-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            try {
                const meterResult = await withRetry(
                    async () =>
                        stripe.billing.meterEvents.create(
                            {
                                event_name: meterEventName,
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
    } else if (isTest) {
        console.log("🧪 Test-environment key → usage logged but not billed");
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
                    // Tagged on every row so rollups and revenue reconciliation
                    // can separate unbilled test traffic from live traffic —
                    // `stripe_reported: false` alone can't, since billing
                    // failures and unsubscribed users produce it too.
                    metadata: { environment },
                });
            },
            RETRY_CONFIGS.DATABASE,
        );
    } catch (logError) {
        console.warn("⚠️ Failed to log usage to database (non-critical):", logError);
    }

    return meterEvent;
}

