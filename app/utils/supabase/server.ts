// lib/supabaseServer.ts
import { createClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookies().get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    cookies().set(name, value, options);
                },
                remove(name: string, options: any) {
                    cookies().set(name, '', { ...options, maxAge: 0 });
                },
            },
        }
    );
}
