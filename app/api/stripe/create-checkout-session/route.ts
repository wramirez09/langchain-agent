import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover",
});

// Input validation schema
const CheckoutSessionSchema = z.object({
    priceId: z.string().min(1, "Price ID is required"),
    email: z.string().email("Invalid email address"),
});

export async function POST(req: Request) {
    try {
        // Validate request body
        const body = await req.json();
        const validation = CheckoutSessionSchema.safeParse(body);

        if (!validation.success) {
            const errorMessage = Object.values(validation.error.format())
                .flatMap((e) => {
                    if (Array.isArray(e)) {
                        return e;
                    }
                    return e?._errors || [];
                })
                .filter(Boolean)
                .join(", ");

            return NextResponse.json({ error: errorMessage }, { status: 400 });
        }

        const { priceId, email } = validation.data;

        // Verify the price exists and is active
        const price = await stripe.prices.retrieve(priceId);
        if (!price.active) {
            return NextResponse.json(
                { error: "This subscription plan is not available" },
                { status: 400 }
            );
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            customer_email: email,
            metadata: {
                email, // Store email in metadata for webhook
            },
            success_url: `http://${process.env.NEXT_PUBLIC_BASE_URL}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
            cancel_url: `http://${process.env.NEXT_PUBLIC_BASE_URL}/sign-up?cancelled=true`,
        });

        if (!session.url) {
            throw new Error("Failed to create checkout session");
        }

        return NextResponse.json({
            url: session.url,
            sessionId: session.id
        });

    } catch (err: unknown) {
        console.error("Checkout session error:", err);

        // Handle Stripe-specific errors
        if (err instanceof Stripe.errors.StripeError) {
            return NextResponse.json(
                { error: err.message },
                { status: 400 }
            );
        }

        // Handle other errors
        const errorMessage = err instanceof Error ? err.message : "Internal server error";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}