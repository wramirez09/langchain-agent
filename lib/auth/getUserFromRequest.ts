import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const noopCookies = {
    getAll() {
        return [];
    },
    setAll() {
        // no-op for mobile
    },
};

export async function getUserFromRequest(req: NextRequest) {
    /* =========================
       1️⃣ MOBILE — Bearer token
       ========================= */
    const authHeader = req.headers.get("authorization");

    if (authHeader?.startsWith("Bearer ")) {
        const accessToken = authHeader.split(" ")[1];

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: noopCookies, // ✅ REQUIRED even for mobile
                global: {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            },
        );

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            console.error("Supabase getUser error:", error);
            throw new Error(`Invalid token: ${error?.message}`);
        }

        return data.user;
    }

    /* =========================
       2️⃣ WEB — Cookie session
       ========================= */
    const cookieStore = cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                async getAll() {
                    return (await cookieStore).getAll();
                },
                async setAll(cookiesToSet) {
                    cookiesToSet.forEach(async ({ name, value, options }) => {
                        (await cookieStore).set(name, value, options);
                    });
                },
            },
        },
    );

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Unauthenticated");

    return data.user;
}