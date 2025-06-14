"use client";

import { ChatWindow } from "@/components/ChatWindow";
// import Form from "./components/Form";

export default function AgentsPage() {
  return (
    <ChatWindow
      endpoint="api/chat/agents"
      // emptyStateComponent={<Form />}
      placeholder="Medicare Pre Authorization Assistance: Ask me about your health concerns!"
      emoji="🦜"
      showIntermediateStepsToggle={true}
    />
  );
}
