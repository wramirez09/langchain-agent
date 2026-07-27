import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/app/utils/server";
import { getStripe } from "@/lib/stripe";



export async function POST(req: Request) {
    try {
        const { email, password, session_id } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        // Proof of purchase gate. This endpoint sets a password via the admin
        // API, so without a check anyone could POST an email + password and seize
        // that account. Require the Stripe Checkout session issued at signup,
        // verify it is paid, and confirm it belongs to this email. Password
        // *resets* don't come through here — they use the recovery session and
        // supabase.auth.updateUser() client-side.
        if (!session_id) {
            return NextResponse.json(
                { error: "Missing checkout session." },
                { status: 400 }
            );
        }

        let sessionEmail: string | null = null;
        try {
            const stripe = getStripe();
            const session = await stripe.checkout.sessions.retrieve(session_id);
            const paid =
                session.payment_status === "paid" ||
                session.payment_status === "no_payment_required" ||
                session.status === "complete";
            sessionEmail = (
                session.customer_details?.email ??
                session.customer_email ??
                null
            );
            if (!paid || !sessionEmail) {
                return NextResponse.json(
                    { error: "Checkout session is not valid." },
                    { status: 403 }
                );
            }
        } catch {
            return NextResponse.json(
                { error: "Checkout session could not be verified." },
                { status: 403 }
            );
        }

        if (sessionEmail.toLowerCase() !== String(email).toLowerCase()) {
            return NextResponse.json(
                { error: "Email does not match the checkout session." },
                { status: 403 }
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
