import { createClient } from "@supabase/supabase-js";

/**
 * SECURITY: This client uses the Supabase service role key, which
 * bypasses Row-Level Security entirely. It MUST NEVER be imported
 * from client-side code (browser, React Native, or any "use client"
 * component).
 *
 * Anywhere this client is used, the calling code is responsible for
 * applying tenant filters (user_id, etc.) explicitly. The service
 * role does not provide any safety net.
 *
 * `user_id` values used in service-role writes must be derived from
 * the verified session (e.g. `getUserFromRequest(req).id`), never
 * from request body or URL parameters.
 */
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables');
}

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);
