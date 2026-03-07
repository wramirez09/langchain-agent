import { NextResponse } from "next/server";
import { createClient } from "@/utils/server";
import { reportUsage } from "@/lib/usage";



export async function POST(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { usage_type = "orchestrator", quantity = 1, metadata = {} } = await req.json();

    try {
        const usageRecord = await reportUsage({
            userId: user.id,
            usageType: usage_type,
            quantity,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });

        if (!usageRecord) {
            return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, usageRecord });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Stripe usage error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}