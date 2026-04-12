import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { createClient } from "@/app/utils/server";



export async function POST() {
    const stripe = getStripe()
    
    if (!stripe) {
        console.error("Stripe is not initialized");
        return NextResponse.json(
            { error: "Stripe is not configured" },
            { status: 500 }
        );
    }
    
    try {
        // 1. Get authenticated user via SSR client
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error("Auth error:", authError);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Fetch stripe_customer_id from profiles table
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", user.id)
            .single();

        if (profileError) {
            console.error("Profile fetch error:", profileError);
            return NextResponse.json(
                { error: "Failed to fetch user profile" },
                { status: 500 }
            );
        }

        if (!profile?.stripe_customer_id) {
            console.error("No stripe_customer_id found for user:", user.id);
            return NextResponse.json(
                { error: "No billing account found for this user." },
                { status: 404 }
            );
        }

        const customerId = profile.stripe_customer_id;
        console.log("Creating billing portal for customer:", customerId);

        // 3. Create Stripe Billing Portal Session
        const returnUrl = process.env.STRIPE_BILLING_RETURN_URL || 
                         process.env.NEXT_PUBLIC_SITE_URL || 
                         'http://localhost:3000';
        
        console.log("Return URL:", returnUrl);

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl
        });

        console.log("Portal session created:", portalSession.id);
        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error("Stripe Portal Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create billing portal session" },
            { status: 500 }
        );
    }
}
