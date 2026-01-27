// app/api/stripe/create-checkout/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";

const CheckoutSessionSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
});

export async function POST(req: Request) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-10-29.clover",
    });

    try {
        /* ------------------------------------------------------------
         * Parse & validate input
         * ------------------------------------------------------------ */
        const body = await req.json();
        const validation = CheckoutSessionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }

        const { email, name } = validation.data;

        /* ------------------------------------------------------------
         * Detect mobile client (Expo / RN)
         * ------------------------------------------------------------ */
        const userAgent = req.headers.get("user-agent") ?? "";
        const isMobileClient =
            userAgent.includes("Expo") ||
            userAgent.includes("ReactNative") ||
            req.headers.get("x-client") === "mobile";

        /* ------------------------------------------------------------
         * Reuse or create Stripe customer
         * ------------------------------------------------------------ */
        const existing = await stripe.customers.list({
            email,
            limit: 1,
        });

        const customer =
            existing.data[0] ??
            (await stripe.customers.create({
                email,
                name,
            }));

        /* ------------------------------------------------------------
         * Base URL
         * ------------------------------------------------------------ */
        const baseUrl =
            process.env.NODE_ENV === "development"
                ? "http://localhost:3000"
                : `https://${process.env.NEXT_PUBLIC_BASE_URL_PROD}`;

        /* ------------------------------------------------------------
         * Success & cancel URLs (ORIGINAL PATH)
         * ------------------------------------------------------------ */
        const successUrl = isMobileClient
            ? `${baseUrl}/auth/update-password?mobile=true&redirect=login&session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(
                email
            )}`
            : `${baseUrl}/auth/update-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(
                email
            )}`;

        const cancelUrl = `${baseUrl}/sign-up?cancelled=true`;

        /* ------------------------------------------------------------
         * Create Stripe Checkout Session
         * ------------------------------------------------------------ */
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customer.id,
            payment_method_types: ["card"],

            line_items: [
                {
                    price: process.env.STRIPE_SUBSCRIPTION_PRICE_ID!,
                    quantity: 1,
                },
                {
                    price: process.env.STRIPE_METERED_PRICE_ID!,
                },
            ],

            success_url: successUrl,
            cancel_url: cancelUrl,
        });

        if (!session.url) {
            throw new Error("Stripe did not return a checkout URL");
        }

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("❌ Checkout session error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
