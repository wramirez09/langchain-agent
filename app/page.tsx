import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";
import { Logo } from "./layout";

export default function Home() {
  return (
    <ChatWindow
      endpoint="api/chat/agents"
      placeholder=""
      showIngestForm
      emoji={<Logo />}
    />
  );
}
