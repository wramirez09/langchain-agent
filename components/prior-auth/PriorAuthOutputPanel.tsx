"use client";

import { type Message } from "ai";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";

interface PriorAuthOutputPanelProps {
  messages: Message[];
  isProcessing: boolean;
}

export function PriorAuthOutputPanel({ messages, isProcessing }: PriorAuthOutputPanelProps) {
  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.content);

  if (assistantMessages.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4">
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">
            No output yet. Fill in the form and click &quot;Generate Authorization&quot; to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="space-y-2 max-w-2xl mx-auto">
        {assistantMessages.map((m, i, arr) => (
          <ChatMessageBubble
            key={m.id}
            message={m}
            sources={[]}
            isLastMessage={i === arr.length - 1}
            isLoading={i === arr.length - 1 && isProcessing}
            bare
          />
        ))}
      </div>
    </div>
  );
}
