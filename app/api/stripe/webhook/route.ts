// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
    const stripe = getStripe();
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
    } catch (err: any) {
        console.error("❌ Invalid Stripe signature:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    try {
        /* ------------------------------------------------------------
         * Helper: Normalize subscription items + dates
         * (uses your original working pattern)
         * ------------------------------------------------------------ */
        const normalizeSubscription = (subs: Stripe.Subscription) => {
            let licensedItemId: string | null = null;
            let meteredItemId: string | null = null;

            for (const item of subs.items.data) {
                const usageType = item.price.recurring?.usage_type;
                if (usageType === "metered") meteredItemId = item.id;
                else licensedItemId = item.id;
            }

            const currentPeriodStart = (subs as any).current_period_start
                ? new Date((subs as any).current_period_start * 1000).toISOString()
                : null;

            const currentPeriodEnd = (subs as any).current_period_end
                ? new Date((subs as any).current_period_end * 1000).toISOString()
                : null;

            return {
                status: subs.status,
                licensedItemId,
                meteredItemId,
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd,
            };
        };

        /* ------------------------------------------------------------
         * 1️⃣ CHECKOUT SESSION COMPLETED
         * ------------------------------------------------------------ */
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            const stripeCustomerId = session.customer as string;
            const stripeSubscriptionId = session.subscription as string;

            if (!stripeCustomerId || !stripeSubscriptionId) {
                return NextResponse.json({ received: true });
            }

            /* --- Fetch subscription ---------------------------------- */
            const subs = await stripe.subscriptions.retrieve(
                stripeSubscriptionId,
                { expand: ["items.data.price"] }
            );

            const normalized = normalizeSubscription(subs);

            /* --- Prefer lookup by stripe_customer_id ------------------ */
            let userId: string | null = null;

            const { data: existingProfile } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", stripeCustomerId)
                .maybeSingle();

            if (existingProfile?.id) {
                userId = existingProfile.id;
            }

            /* --- Fallback: create user via email ---------------------- */
            if (!userId) {
                const email =
                    session.customer_details?.email ??
                    session.customer_email ??
                    null;

                if (!email) {
                    return NextResponse.json({ received: true });
                }

                const { data, error } =
                    await supabaseAdmin.auth.admin.createUser({
                        email,
                        email_confirm: true,
                    });

                if (error) throw error;

                userId = data.user.id;

                await supabaseAdmin.from("profiles").insert({
                    id: userId,
                    email,
                    stripe_customer_id: stripeCustomerId,
                    is_active:
                        normalized.status === "active" ||
                        normalized.status === "trialing",
                });
            }

            /* --- Upsert subscription --------------------------------- */
            await supabaseAdmin
                .from("subscriptions")
                .upsert(
                    {
                        user_id: userId,
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: subs.id,
                        subscription_item_id: normalized.licensedItemId,
                        metered_item_id: normalized.meteredItemId,
                        status: normalized.status,
                        current_period_start: normalized.current_period_start,
                        current_period_end: normalized.current_period_end,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "stripe_subscription_id" }
                );

            /* --- Update profile -------------------------------------- */
            await supabaseAdmin
                .from("profiles")
                .update({
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: subs.id,
                    is_active:
                        normalized.status === "active" ||
                        normalized.status === "trialing",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", userId);
        }

        /* ------------------------------------------------------------
         * 2️⃣ SUBSCRIPTION UPDATED / DELETED
         * ------------------------------------------------------------ */
        if (
            event.type === "customer.subscription.updated" ||
            event.type === "customer.subscription.deleted"
        ) {
            const subs = event.data.object as Stripe.Subscription;
            const normalized = normalizeSubscription(subs);

            await supabaseAdmin
                .from("subscriptions")
                .update({
                    status: normalized.status,
                    subscription_item_id: normalized.licensedItemId,
                    metered_item_id: normalized.meteredItemId,
                    current_period_start: normalized.current_period_start,
                    current_period_end: normalized.current_period_end,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", subs.id);

            if (event.type === "customer.subscription.deleted") {
                await supabaseAdmin
                    .from("profiles")
                    .update({ is_active: false })
                    .eq("stripe_subscription_id", subs.id);
            }
        }

        /* ------------------------------------------------------------
         * 3️⃣ PAYMENT FAILED
         * ------------------------------------------------------------ */
        if (event.type === "invoice.payment_failed") {
            const invoice = event.data.object as Stripe.Invoice;

            await supabaseAdmin
                .from("subscriptions")
                .update({ status: "past_due" })
                .eq("stripe_subscription_id", (invoice as any).subscription);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("❌ Webhook processing error:", error);
        return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
    }
}
