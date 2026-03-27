import type { Metadata } from "next";
<<<<<<< HEAD
import { ChatWindow } from "@/components/ChatWindow";
import { PreAuthTour } from "@/components/PreAuthTour";
import { TourTriggerButton } from "@/components/TourTriggerButton";
import { redirect } from 'next/navigation';
import logo from "@/public/images/logo-main.svg";
import Image from "next/image";
import { createClient } from '@/utils/server';
=======
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/server';
import { AppShellClient } from '@/components/AppShellClient';
>>>>>>> dev

export const metadata: Metadata = {
  title: "Prior Auth Screening",
  description: "Run AI-powered authorization readiness screening. Get instant Medicare NCD/LCD and payer policy insights before submitting your prior authorization request.",
  robots: { index: false, follow: false },
};
<<<<<<< HEAD



=======
>>>>>>> dev

export default async function Home() {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
        redirect('/auth/login')
    }

    return <AppShellClient />;
}
