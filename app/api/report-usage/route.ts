import { NextResponse } from "next/server";
import { createClient } from "@/utils/server";
import { reportUsageToStripe } from "@/lib/usage";

export async function POST(req: Request) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { usage_type, quantity = 1, metadata = {} } = await req.json();
      if (!usage_type) {
          return NextResponse.json({ error: "Missing usage_type" }, { status: 400 });
      }

      const usageRecord = await reportUsageToStripe({
          userId: user.id,
          usageType: usage_type,
          quantity,
        metadata,
    });

      if (!usageRecord) {
          return NextResponse.json(
              { error: "No active subscription found" },
              { status: 404 }
          );
      }

      return NextResponse.json({ success: true, usageRecord });

  } catch (err: any) {
      console.error("Usage Reporting Error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
