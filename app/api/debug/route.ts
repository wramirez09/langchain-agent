import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        stripeKeyDefined: !!process.env.STRIPE_SECRET_KEY,
        vercelEnv: process.env.VERCEL_ENV,
        stripeKeys: Object.keys(process.env).filter((k) => k.startsWith("STRIPE")),
        nextKeys: Object.keys(process.env).filter((k) => k.startsWith("NEXT")),
    });
}