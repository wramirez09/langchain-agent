import { redirect } from 'next/navigation'
import { createClient } from '@/utils/server'
import { AppShellClient } from '@/components/AppShellClient'

export default async function Home() {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
        redirect('/auth/login')
    }

    return <AppShellClient />;
}
