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
         * Helper: resolve the app user behind a Stripe customer
         *
         * Checkout guarantees a fresh customer, but a subscription created in
         * the Stripe Dashboard usually belongs to someone who already signed
         * up — often with an auth user but no `profiles` row yet. Blindly
         * calling createUser() for those throws "already registered", so we
         * walk from most to least specific and only create as a last resort.
         * ------------------------------------------------------------ */
        const resolveUserId = async (
            stripeCustomerId: string,
            email: string | null,
        ): Promise<string | null> => {
            const { data: byCustomer } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", stripeCustomerId)
                .maybeSingle();
            if (byCustomer?.id) return byCustomer.id;

            if (!email) return null;

            const { data: byEmail } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .ilike("email", email)
                .maybeSingle();
            if (byEmail?.id) return byEmail.id;

            // Auth user may exist without a profiles row. There is no
            // admin-API lookup by email, so scan — bounded, since this only
            // runs on the non-Checkout path.
            for (let page = 1; page <= 10; page++) {
                const { data, error } = await supabaseAdmin.auth.admin.listUsers({
                    page,
                    perPage: 200,
                });
                if (error || !data?.users?.length) break;
                const hit = data.users.find(
                    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
                );
                if (hit) return hit.id;
                if (data.users.length < 200) break;
            }

            return null;
        };

        /* ------------------------------------------------------------
         * Helper: write a subscription through to Supabase
         *
         * Shared by the Checkout and Dashboard paths so both provision
         * identically — previously only Checkout did, which meant every
         * invoice-billed or sales-assisted subscription silently never
         * granted access.
         * ------------------------------------------------------------ */
        const provisionSubscription = async (
            stripeCustomerId: string,
            subs: Stripe.Subscription,
            emailHint: string | null,
        ) => {
            const normalized = normalizeSubscription(subs);
            const isActive =
                normalized.status === "active" || normalized.status === "trialing";

            let email = emailHint;
            if (!email) {
                const customer = await stripe.customers.retrieve(stripeCustomerId);
                if (!("deleted" in customer && customer.deleted)) {
                    email = (customer as Stripe.Customer).email ?? null;
                }
            }

            let userId = await resolveUserId(stripeCustomerId, email);

            if (!userId) {
                if (!email) return null;

                const { data, error } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    email_confirm: true,
                });
                if (error) throw error;
                userId = data.user.id;
            }

            const customer = await stripe.customers.retrieve(stripeCustomerId);
            const termsAccepted =
                !("deleted" in customer && customer.deleted) &&
                (customer as Stripe.Customer).metadata?.terms_accepted === "true"
                    ? true
                    : null;

            // Upsert, not insert: the auth user may predate this subscription
            // and already own a profiles row.
            await supabaseAdmin.from("profiles").upsert(
                {
                    id: userId,
                    email,
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: subs.id,
                    is_active: isActive,
                    ...(termsAccepted !== null
                        ? { term_of_agreement: termsAccepted }
                        : {}),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "id" },
            );

            await supabaseAdmin.from("subscriptions").upsert(
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
                { onConflict: "stripe_subscription_id" },
            );

            return userId;
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
            const subs = await stripe.subscriptions.retrieve(stripeSubscriptionId);

            await provisionSubscription(
                stripeCustomerId,
                subs,
                session.customer_details?.email ?? session.customer_email ?? null,
            );
        }

        /* ------------------------------------------------------------
         * 1️⃣b SUBSCRIPTION CREATED (outside Checkout)
         *
         * Dashboard-created, invoice-billed and sales-assisted subscriptions
         * never emit checkout.session.completed. Without this branch they were
         * never provisioned: `.updated`/`.deleted` below only UPDATE a row
         * matched on stripe_subscription_id, which silently matches nothing.
         * ------------------------------------------------------------ */
        if (event.type === "customer.subscription.created") {
            const created = event.data.object as Stripe.Subscription;
            const stripeCustomerId = created.customer as string;

            if (stripeCustomerId) {
                // Re-fetch rather than trusting the event payload: it can be
                // minutes stale by the time the webhook is processed (and
                // retried), and provisioning writes the item ids and period.
                const subs = await stripe.subscriptions.retrieve(created.id);
                await provisionSubscription(stripeCustomerId, subs, null);
            }
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
