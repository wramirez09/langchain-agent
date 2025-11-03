import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "app/utils/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-10-29.clover" });

export async function reportUsageToStripe(subscriptionItemId: string, quantity = 1) {
    // Type assertion fixes TS error
    const usageRecord = await (stripe.subscriptionItems as any).createUsageRecord(
        subscriptionItemId,
        {
            quantity,
            timestamp: Math.floor(Date.now() / 1000),
            action: "increment",
        }
    );

    return usageRecord;
}
export async function POST(req: Request) {
    const supabase = createClient();
    const { user } = await supabase.auth.getUser();
    const { subscription_item_id, usage_type, quantity = 1, metadata = {} } = await req.json();

    if (!user || !subscription_item_id) return NextResponse.json({ error: "Unauthorized or missing subscription_item_id" }, { status: 400 });

    try {
        const usageRecord = await reportUsageToStripe(subscription_item_id, quantity);

        await supabase.from("usage_logs").insert({
            user_id: user.id,
            subscription_item_id,
            usage_type,
            quantity,
            stripe_reported: true,
            stripe_usage_id: usageRecord.id,
            metadata,
        });

        return NextResponse.json({ success: true, usageRecord });
    } catch (err: any) {
        console.error("Stripe usage error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
