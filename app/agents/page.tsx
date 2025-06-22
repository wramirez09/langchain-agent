"use client";

import { ChatWindow } from "@/components/ChatWindow";
// import Form from "./components/Form";

export default function AgentsPage() {
  return (
    <ChatWindow
      endpoint="api/chat/agents"
      // emptyStateComponent={<Form />}
      placeholder="Squawk! I'm a conversational agent! Ask me about the current weather in Honolulu!"
      // emoji="🦜"
      showIntermediateStepsToggle={true}
    />
  );
}
