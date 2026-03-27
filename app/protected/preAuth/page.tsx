import type { Metadata } from "next";
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/server';
import { AppShellClient } from '@/components/AppShellClient';

export const metadata: Metadata = {
  title: "Prior Auth Screening",
  description: "Run AI-powered authorization readiness screening. Get instant Medicare NCD/LCD and payer policy insights before submitting your prior authorization request.",
  robots: { index: false, follow: false },
};

export default async function Home() {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
        redirect('/auth/login')
    }

    return <AppShellClient />;
}
