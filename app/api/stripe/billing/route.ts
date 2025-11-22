import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { createClient } from "@/app/utils/server";

export async function POST() {
    try {
        // 1. Get authenticated user via SSR client
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Fetch stripe_customer_id from profiles table
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", user.id)
            .single();

        if (profileError || !profile?.stripe_customer_id) {
            return NextResponse.json(
                { error: "No billing account found for this user." },
                { status: 404 }
            );
        }

        const customerId = profile.stripe_customer_id;

        // 3. Create Stripe Billing Portal Session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url:
                process.env.STRIP_BILLING_RETURN_URL ||
                process.env.NEXT_PUBLIC_SITE_URL
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error("Stripe Portal Error:", error);
        return NextResponse.json(
            { error: "Failed to create billing portal session" },
            { status: 500 }
        );
    }
}
