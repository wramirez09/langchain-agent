// /utils/supabase/server.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Make sure these env variables exist in your .env.local
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!; // server-only key

/**
 * Create a Supabase client for server-side usage.
 * This client can perform admin operations (service role) safely.
 */
export const createClient = () => {
    return createSupabaseClient(supabaseUrl, supabaseKey, {
        auth: {
            // Edge runtime / server-side
            persistSession: false,
        },
    });
};
