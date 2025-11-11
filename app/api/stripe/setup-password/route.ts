// app/api/stripe/setup-password/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        // 1️⃣ Ensure user was created by webhook
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const user = users.find((u) => u.email === email);
        if (!user) {
            return NextResponse.json({
                error: "User not found yet — webhook may still be processing. Try again in 3 seconds."
            }, { status: 409 });
        }

        // 2️⃣ Update password using admin API (no session required)
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password,
            email_confirm: true,
        });
        if (updateError) throw updateError;

        // 3️⃣ Update profile record (ensure is_active)
        await supabaseAdmin.from("profiles").upsert({
            id: user.id,
            email,
            is_active: true,
            updated_at: new Date().toISOString(),
        });

        // 4️⃣ Create an SSR Supabase client that can set auth cookies
        const supabase = createServerClient();

        // 5️⃣ Sign user in → writes cookies automatically
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (signInError) throw signInError;

        // 6️⃣ Redirect to dashboard now that session cookie exists
        return NextResponse.json({ success: true, redirect: "/dashboard" });

    } catch (err: any) {
        console.error("Setup password API error:", err);
        return NextResponse.json({ error: err.message || "Failed to set password" }, { status: 500 });
    }
}
