import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover", // Match the API version used in report-usage/route.ts
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
    } catch (err: any) {
        console.error(`⚠️ Webhook signature verification failed:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 400 })
    }

    const supabase = supabaseAdmin;

    try {
        switch (event.type) {
            // Handle checkout session completion
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                const customerEmail = session.customer_details?.email;
                const stripeCustomerId = session.customer as string;
                const stripeSubscriptionId = session.subscription as string;

                if (!customerEmail) {
                    console.error("❌ No customer email in session");
                    return NextResponse.json(
                        { error: "No customer email" },
                        { status: 400 }
                    );
                }

                // First, check if user exists by email
                const { data: { users }, error: listUsersError } = await supabase.auth.admin.listUsers();

                // Find user by email from the list
                const existingUser = users?.find(user => user.email === customerEmail);
                let userId: string;

                if (!existingUser) {
                    // Create user in auth.users
                    const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
                        email: customerEmail,
                        email_confirm: true,
                        password: Math.random().toString(36).slice(2), // Generate a random password
                        user_metadata: {
                            full_name: session.customer_details?.name || '',
                            provider: 'stripe'
                        }
                    });

                    if (createUserError || !newUser) {
                        console.error("❌ Error creating user:", createUserError);
                        throw new Error(createUserError?.message || "Failed to create user");
                    }

                    userId = newUser.user.id;

                    // Create profile in public.profiles
                    const { error: profileError } = await supabase
                        .from("profiles")
                        .insert({
                            id: newUser.user.id,
                            email: customerEmail,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });

                    if (profileError) {
                        console.error("❌ Error creating profile:", profileError);
                        throw new Error("Failed to create user profile");
                    }

                } else {
                    userId = existingUser.id;
                }

                // Retrieve full subscription to get status and period end
                const subscription = await stripe.subscriptions.retrieve(
                    stripeSubscriptionId,
                    { expand: ["items.data"] }
                );

                // Get the current period from the first item
                const item = subscription.items.data[0];
                const currentPeriodEnd = item.current_period_end
                    ? new Date(item.current_period_end * 1000)
                    : null;

                // Upsert subscription data
                const { error: subscriptionError } = await supabase
                    .from("subscriptions")
                    .upsert(
                        {
                            user_id: userId,
                            stripe_customer_id: stripeCustomerId,
                            stripe_subscription_id: stripeSubscriptionId,
                            status: subscription.status,
                            current_period_end: currentPeriodEnd?.toISOString(),
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: "stripe_subscription_id",
                        }
                    );

                if (subscriptionError) {
                    console.error("❌ Error saving subscription:", subscriptionError);
                    throw new Error("Failed to save subscription");
                }

                console.log(`✅ Created/updated subscription for user ${userId}`);
                break;
            }

            // Handle subscription updates and cancellations
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;

                // Get the current period from the first item
                const item = subscription.items.data[0];
                const currentPeriodEnd = item.current_period_end
                    ? new Date(item.current_period_end * 1000)
                    : null;

                await supabase
                    .from("subscriptions")
                    .update({
                        status: subscription.status,
                        current_period_end: currentPeriodEnd?.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("stripe_subscription_id", subscription.id);

                console.log(
                    `🔁 Subscription ${subscription.id} updated to status: ${subscription.status}`
                );
                break;
            }

            // Handle successful payments
            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice & {
                    subscription: string | { id: string } | Stripe.Subscription;
                };
                if (!invoice.subscription) {
                    console.warn('No subscription found in invoice');
                    break;
                }

                const subscriptionId = typeof invoice.subscription === 'string'
                    ? invoice.subscription
                    : invoice.subscription.id;

                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                        expand: ["items.data"],
                    });

                    const item = subscription.items.data[0];
                    const currentPeriodEnd = item.current_period_end
                        ? new Date(item.current_period_end * 1000)
                        : null;

                    await supabase
                        .from("subscriptions")
                        .update({
                            status: subscription.status,
                            current_period_end: currentPeriodEnd?.toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .eq("stripe_subscription_id", subscriptionId);

                    console.log(`💰 Payment succeeded for subscription ${subscriptionId}`);
                }
                break;
            }

            // Handle failed payments
            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice & {
                    subscription: string | { id: string };
                };

                const subscriptionId = typeof invoice.subscription === 'string'
                    ? invoice.subscription
                    : invoice.subscription?.id;

                if (!subscriptionId) {
                    console.warn('No valid subscription ID found in invoice');
                    break;
                }

                if (subscriptionId) {
                    await supabase
                        .from("subscriptions")
                        .update({
                            status: "past_due" as const,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("stripe_subscription_id", subscriptionId);

                    console.warn(`⚠️ Payment failed for subscription ${subscriptionId}`);
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error(`Webhook handling error:`, err);
        return NextResponse.json(
            { error: "Webhook handler failed" },
            { status: 500 }
        );
    }
}