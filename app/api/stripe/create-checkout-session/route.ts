import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
    const { userId, priceId } = await req.json();

    // Get user email from Supabase profiles
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();

    if (!profile?.email) return new Response("User not found", { status: 404 });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
        customer_email: profile.email,
    });

    return Response.json({ url: session.url });
}
