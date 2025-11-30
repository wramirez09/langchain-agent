import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";

const CheckoutSessionSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1), // NEW
});


export async function POST(req: Request) {
    const stripe = getStripe()
    console.log("stripe", getStripe());
    try {
        const body = await req.json();
        const validation = CheckoutSessionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }

        const { email, name } = validation.data;

        // Reuse existing customer if any, otherwise create one with name
        const existing = await getStripe()?.customers.list({ email, limit: 1 });
        const customer =
            existing?.data[0] ?? (await getStripe()?.customers.create({ email, name }));


        const session: any = await getStripe()?.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            customer: customer?.id, // ensures name is known to Checkout

            line_items: [
                { price: process.env.STRIPE_SUBSCRIPTION_PRICE_ID, quantity: 1 },
                { price: process.env.STRIPE_METERED_PRICE_ID },
            ],

            success_url: `https://${process.env.NEXT_PUBLIC_BASE_URL_PROD}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
            cancel_url: `https://${process.env.NEXT_PUBLIC_BASE_URL_PROD}/sign-up?cancelled=true`,
        });


        if (!session?.url) {
            throw new Error('Failed to create checkout session: No URL returned from Stripe');
        }

        return NextResponse.json({ url: session?.url });
    } catch (error: any) {
        console.error("Checkout session error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}