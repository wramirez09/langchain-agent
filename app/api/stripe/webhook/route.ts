// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
    } catch (err: any) {
        return NextResponse.json(
            { error: `Invalid signature: ${err.message}` },
            { status: 400 }
        );
    }

    try {
        /* ------------------------------------------------------------
         * 1️⃣ CHECKOUT COMPLETED
         * ------------------------------------------------------------ */
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            const email = session.customer_details?.email ?? session.customer_email ?? null;
            const name = session.customer_details?.name ?? null;
            const stripeCustomerId = session.customer as string;
            const stripeSubscriptionId = session.subscription as string;

            if (!email) {
                return NextResponse.json({ received: true });
            }

            /* --- Create or fetch user ----------------------------------- */
            const { data: existing } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            let userId = existing?.id;

            if (!userId) { // no auth user in supabase so we create one
                const { data, error } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    email_confirm: true,
                });
                if (error) throw error;

                userId = data.user.id;

                // create profile
                await supabaseAdmin.from("profiles").insert({
                    id: userId,
                    email,
                    full_name: name,
                    stripe_customer_id: stripeCustomerId,
                    is_active: true,
                });
            }

            /* ------------------------------------------------------------
             * Fetch subscription with items — includes licensed + metered
             * ------------------------------------------------------------ */
            const subs = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                expand: ["items.data.price"],
            });

            let licensedItemId: string | null = null;
            let meteredItemId: string | null = null;

            for (const item of subs.items.data) {
                const usageType = item.price.recurring?.usage_type;

                if (usageType === "metered") {
                    meteredItemId = item.id;
                } else {
                    licensedItemId = item.id;
                }
            }

            const currentPeriodStart = (subs as any).current_period_start
                ? new Date((subs as any).current_period_start * 1000).toISOString()
                : null;

            const currentPeriodEnd = (subs as any).current_period_end
                ? new Date((subs as any).current_period_end * 1000).toISOString()
                : null;

            /* ------------------------------------------------------------
             * Store subscription in DB
             * ------------------------------------------------------------ */
            await supabaseAdmin
                .from("subscriptions")
                .upsert(
                    {
                        user_id: userId,
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: subs.id,
                        subscription_item_id: licensedItemId,
                        metered_item_id: meteredItemId,
                        status: subs.status,
                        current_period_start: currentPeriodStart,
                        current_period_end: currentPeriodEnd,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "stripe_subscription_id" }
                );

            await supabaseAdmin
                .from("profiles")
                .update({
                    is_active: true,
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: subs.id,
                    full_name: name,
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

            await supabaseAdmin
                .from("subscriptions")
                .update({
                    status: subs.status,
                    subscription_item_id: licensedItemId,
                    metered_item_id: meteredItemId,
                    current_period_start: currentPeriodStart,
                    current_period_end: currentPeriodEnd,
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

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("❌ Webhook Processing Error:", error);
        return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
    }
}


// TODO: Add error handling
