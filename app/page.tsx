import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";

export default function Home() {
  return <ChatWindow endpoint="api/chat/agents" placeholder="" />;
}
