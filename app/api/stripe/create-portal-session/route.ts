import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { customerId } = await req.json();

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: process.env.NEXT_PUBLIC_SITE_URL,
    });

    return NextResponse.json({ url: session.url });
}
