

import { ChatWindow } from "@/components/ChatWindow";
import { redirect } from 'next/navigation'
import logo from "@/public/images/logo-main.svg";
import Image from "next/image";
import { createClient } from '@/utils/server'


export default async function Home() {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims) {
        redirect('/auth/login')
    }

    return (
        <ChatWindow
            userData={data}
            endpoint="api/chat/agents"
            placeholder=""
            showIngestForm
            showIntermediateStepsToggle
            emoji={
                <Image src={logo} alt="NoteDoctor.Ai Logo" className="h-8 w-auto" />
            }
        />
    );
}
