import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
        console.error("⚠️ Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                const customerEmail = session.customer_details?.email;
                const stripeCustomerId = session.customer as string;
                const stripeSubscriptionId = session.subscription as string;

                if (!customerEmail) {
                    console.error("❌ No customer email in session");
                    return NextResponse.json({ error: "No customer email" }, { status: 400 });
                }

                // Check if user already exists in Supabase
                let { data: existingUser } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("email", customerEmail)
                    .single();

                let userId: string;

                if (!existingUser) {
                    // Create new user via Supabase Admin
                    const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
                        email: customerEmail,
                        email_confirm: false, // password not yet set
                    });

                    if (createUserError || !newUser) throw new Error("Failed to create Supabase user");

                    userId = newUser.id;

                    // Create profile
                    const { error: profileError } = await supabase
                        .from("profiles")
                        .upsert({
                            id: userId,
                            email: customerEmail,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        });
                    if (profileError) throw profileError;
                } else {
                    userId = existingUser.id;
                }

                // Store subscription in Supabase
                const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                    expand: ["items.data"],
                });
                const item = subscription.items.data[0];
                const currentPeriodEnd = item.current_period_end ? new Date(item.current_period_end * 1000) : null;

                const { error: subscriptionError } = await supabase
                    .from("subscriptions")
                    .upsert({
                        user_id: userId,
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: stripeSubscriptionId,
                        status: subscription.status,
                        current_period_end: currentPeriodEnd?.toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: "stripe_subscription_id" });
                if (subscriptionError) throw subscriptionError;

                // Update Stripe Checkout Session metadata with Supabase user ID
                await stripe.checkout.sessions.update(session.id, {
                    metadata: {
                        ...session.metadata, // Preserve existing metadata
                        supabaseUserId: userId,
                    },
                    success_url: `http://${process.env.NEXT_PUBLIC_BASE_URL}/auth/setup-password?session_id=${session.id}&email=${encodeURIComponent(customerEmail)}&userId=${userId}`,
                });

                console.log(`✅ Checkout session completed. Supabase user ID: ${userId}`);
                break;
            }

            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                const item = subscription.items.data[0];
                const currentPeriodEnd = item.current_period_end ? new Date(item.current_period_end * 1000) : null;

                await supabase
                    .from("subscriptions")
                    .update({
                        status: subscription.status,
                        current_period_end: currentPeriodEnd?.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("stripe_subscription_id", subscription.id);

                console.log(`🔁 Subscription ${subscription.id} updated to status: ${subscription.status}`);
                break;
            }

            case "invoice.payment_succeeded":
            case "invoice.payment_failed":
                // Keep your existing logic for handling invoice events
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error("Webhook handling error:", err);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}
