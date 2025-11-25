import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/utils/server";
import { reportUsageToStripeServer } from "@/lib/reportUsageToStripeServer";


export async function POST(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { subscription_item_id, usage_type, quantity = 1, metadata = {} } = await req.json();

    if (!user || !subscription_item_id) return NextResponse.json({ error: "Unauthorized or missing subscription_item_id" }, { status: 400 });

    try {
        const usageRecord = await reportUsageToStripeServer(subscription_item_id, quantity);

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