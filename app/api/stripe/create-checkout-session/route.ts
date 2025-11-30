import { NextResponse } from "next/server";
import { z } from "zod";
import stripe from "@/lib/stripe";

const CheckoutSessionSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1), // NEW
});

const getsuccessUrl = (email: string) => {

        switch (process.env.NODE_ENV as string) {
            case "development":
                return `http://${process.env.NEXT_PUBLIC_BASE_URL}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`;

                break;
            case "preview":
                return `https://${process.env.NEXT_PUBLIC_BASE_URL_PREVIEW}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`;

                break;
            case "production":
                return `https://${process.env.NEXT_PUBLIC_BASE_URL_PROD}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`;

                break;
            default:
                return `http://${process.env.NEXT_PUBLIC_BASE_URL}/auth/setup-password?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`;
                break;
        }

    }



const getCancelUrl = () => {

    switch (process.env.NODE_ENV as string) {
        case "development":
            return `http://${process.env.NEXT_PUBLIC_BASE_URL}/sign-up?cancelled=true`;
            break;
        case "preview":
            return `https://${process.env.NEXT_PUBLIC_BASE_URL_PREVIEW}/sign-up?cancelled=true`;
            break;
        case "production":
            return `https://${process.env.NEXT_PUBLIC_BASE_URL_PROD}/sign-up?cancelled=true`;
            break;
        default:
            break;
    }

};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validation = CheckoutSessionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }

        const { email, name } = validation.data;

        // Reuse existing customer if any, otherwise create one with name
        const existing = await stripe?.customers.list({ email, limit: 1 });
        const customer =
            existing?.data[0] ?? (await stripe?.customers.create({ email, name }));


        const session = await stripe?.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            customer: customer?.id, // ensures name is known to Checkout

            line_items: [
                { price: process.env.STRIPE_SUBSCRIPTION_PRICE_ID, quantity: 1 },
                { price: process.env.STRIPE_METERED_PRICE_ID },
            ],

            success_url: getsuccessUrl(email),
            cancel_url: getCancelUrl(),
        });

        return NextResponse.json({ url: session?.url });
    } catch (error: any) {
        console.error("Checkout session error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}