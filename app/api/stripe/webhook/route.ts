import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16",
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
    } catch (err: any) {
        return NextResponse.json({ error: `Invalid signature: ${err.message}` }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    try {

        // ✅ Handle Checkout Complete: Create user + subscription
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;

            const email = session.customer_details?.email ?? session.customer_email;
            const name = session.customer_details?.name ?? null;
            const stripeCustomerId = session.customer as string;
            const stripeSubscriptionId = session.subscription as string;

            if (!email || !stripeSubscriptionId) return NextResponse.json({ received: true });

            // Create or Get User
            const { data: profile } = await supabase
                .from("profiles")
                .select("id")
                .eq("email", email)
                .maybeSingle();

            let userId = profile?.id;
            if (!userId) {
                const { data, error } = await supabase.auth.admin.createUser({
                    email,
                    email_confirm: true,
                });
                if (error) throw error;
                userId = data.user.id;
                await supabase.from("profiles").insert({ id: userId, email });
            }

            // Fetch subscription fully
            const subs = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ["items"] });
            const item = subs.items.data[0];

            await supabase.from("subscriptions").upsert({
                user_id: userId,
                stripe_customer_id: stripeCustomerId,
                stripe_subscription_id: subs.id,
                subscription_item_id: item.id,
                status: subs.status,
                current_period_start: new Date(subs.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subs.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: "stripe_subscription_id" });

            // Update user profile
            await supabase.from("profiles")
                .update({
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: subs.id,
                    full_name: name,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", userId);
        }

        // ✅ Handle Billing Updates (renewals, pauses, cancellations)
        if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
            const subs = event.data.object as Stripe.Subscription;
            const item = subs.items.data[0];

            const currentPeriodStartIso = subs.current_period_start
                ? new Date(subs.current_period_start * 1000).toISOString()
                : null;

            const currentPeriodEndIso = subs.current_period_end
                ? new Date(subs.current_period_end * 1000).toISOString()
                : null;

            await supabase
                .from("subscriptions")
                .update({
                    status: subs.status,
                    current_period_start: currentPeriodStartIso,
                    current_period_end: currentPeriodEndIso,
                    subscription_item_id: item?.id ?? null,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", subs.id);

            // 👇 Also correctly handle deactivation when canceled
            if (event.type === "customer.subscription.deleted") {
                await supabase
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