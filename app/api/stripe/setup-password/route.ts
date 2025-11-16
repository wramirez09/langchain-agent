import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "app/utils/supabase/server";

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        // Wait until webhook created the user
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const user = users.find((u) => u.email === email);
        if (!user) {
            return NextResponse.json(
                { error: "User not found. Try again in a few seconds." },
                { status: 404 }
            );
        }

        // Update password and confirm email
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password,
            email_confirm: true,
        });
        if (updateError) throw updateError;

        // Mark profile active
        await supabaseAdmin.from("profiles").upsert({
            id: user.id,
            email,
            is_active: true,
            updated_at: new Date().toISOString(),
        });

        // Sign user in and set auth cookie
        const supabase = await createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (signInError) throw signInError;

        return NextResponse.json({ success: true, redirect: "/auth/login" });
    } catch (err: any) {
        console.error("Setup password API error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to set up password" },
            { status: 500 }
        );
    }
}
