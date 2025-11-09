import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        // Get user by email using the admin client
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const user = users.find((u) => u.email === email);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Update password using admin client
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password,
            email_confirm: true,
        });
        if (updateError) throw updateError;

        // Upsert profile using admin client
        const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
                id: user.id,
                email,
                updated_at: new Date().toISOString(),
            });

        if (profileError) throw profileError;

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Setup password API error:", err);
        return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
    }
}
