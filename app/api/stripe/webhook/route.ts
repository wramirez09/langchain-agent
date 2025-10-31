import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";

export async function POST(req: Request) {
    const sig = req.headers.get("stripe-signature")!;
    const body = await req.text();

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
        console.error("Webhook signature failed", err);
        return new Response("Invalid signature", { status: 400 });
    }

    switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;

            await supabaseAdmin.from("subscriptions").upsert({
                id: subscription.id,
                user_id: subscription.customer as string, // or map via stripe_customer_id in profiles
                status: subscription.status,
                current_period_start: subscription.start_date
                    ? new Date(subscription.start_date * 1000).toISOString()
                    : null,
                current_period_end: subscription.start_date
                    ? new Date(subscription.start_date + 30 * 1000).toISOString()
                    : null,
                cancel_at_period_end: subscription.cancel_at_period_end,
                canceled_at: subscription.canceled_at
                    ? new Date(subscription.canceled_at * 1000).toISOString()
                    : null,
            });
            break;
        }
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response("ok", { status: 200 });
}
