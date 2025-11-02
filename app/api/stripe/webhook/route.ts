import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/utils/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
    } catch (err: any) {
        console.error(`⚠️  Webhook signature verification failed:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const supabase = createClient();

    try {
        switch (event.type) {
            /**
             * Handle checkout completion — link Stripe subscription to Supabase user
             */
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                const customerEmail = session.customer_email!;
                const stripeCustomerId = session.customer as string;
                const stripeSubscriptionId = session.subscription as string;

                // Match user by email in Supabase
                const { data: user, error: userError } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("email", customerEmail)
                    .single();

                if (userError || !user) {
                    console.error("❌ No matching Supabase user found for checkout session");
                    break;
                }

                // Retrieve full subscription, expanding items to access period fields
                const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                    expand: ["items.data"],
                });

                const item = subscription.items?.data[0];
                const currentPeriodEnd = item?.current_period_end
                    ? new Date(item.current_period_end * 1000)
                    : null;

                await supabase.from("subscriptions").upsert({
                    user_id: user.id,
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: stripeSubscriptionId,
                    status: subscription.status,
                    current_period_end: currentPeriodEnd,
                });

                console.log(`✅ Subscription stored for ${customerEmail}`);
                break;
            }

            /**
             * Handle subscription updates (renewals, cancellations, etc.)
             */
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;

                // Get the current period from the first item
                const item = subscription.items?.data[0];
                const currentPeriodEnd = item?.current_period_end
                    ? new Date(item.current_period_end * 1000)
                    : null;

                await supabase
                    .from("subscriptions")
                    .update({
                        status: subscription.status,
                        current_period_end: currentPeriodEnd,
                    })
                    .eq("stripe_subscription_id", subscription.id);

                console.log(`🔁 Subscription updated: ${subscription.id} (${subscription.status})`);
                break;
            }

            case "invoice.paid": {
                const invoice = event.data.object as Stripe.Invoice;
                console.log(`💰 Invoice paid: ${invoice.id}`);
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                console.warn(`⚠️ Payment failed for invoice ${invoice.id}`);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error(`Webhook handling error:`, err);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}
