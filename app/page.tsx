import { ChatWindow } from "@/components/ChatWindow";
import logo from "@/public/images/logo-main.svg";
import Image from "next/image";

export default function Home() {
  return (
    <ChatWindow
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
