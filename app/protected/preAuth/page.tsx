import type { Metadata } from "next";
import { ChatWindow } from "@/components/ChatWindow";
import { PreAuthTour } from "@/components/PreAuthTour";
import { TourTriggerButton } from "@/components/TourTriggerButton";
import { redirect } from 'next/navigation';
import logo from "@/public/images/logo-main.svg";
import Image from "next/image";
import { createClient } from '@/utils/server';

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

    return (
        <PreAuthTour>
            <ChatWindow
                endpoint="/api/chat/agents"
                placeholder=""
                showIngestForm
                showIntermediateStepsToggle
                emoji={
                    <Image src={logo} alt="NoteDoctor.ai Logo" className="h-8 w-auto" />
                }
            />
            <TourTriggerButton />
        </PreAuthTour>
    );
}
