

import { ChatWindow } from "@/components/ChatWindow";
import { PreAuthTour } from "@/components/PreAuthTour";
import { TourTriggerButton } from "@/components/TourTriggerButton";
import { redirect } from 'next/navigation'
import logo from "@/public/images/logo-main.svg";
import Image from "next/image";
import { createClient } from '@/utils/server'




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
