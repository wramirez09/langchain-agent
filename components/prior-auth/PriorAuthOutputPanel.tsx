"use client";

import { type Message } from "ai";
import { Bookmark } from "lucide-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import {
  PriorAuthArtifact,
  looksLikeArtifact,
} from "@/components/prior-auth/artifact/PriorAuthArtifact";

interface PriorAuthOutputPanelProps {
  messages: Message[];
  isProcessing: boolean;
  canSave?: boolean;
  onSaveQuery?: () => void;
}

export function PriorAuthOutputPanel({
  messages,
  isProcessing,
  canSave,
  onSaveQuery,
}: PriorAuthOutputPanelProps) {
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

  // The Output tab shows the latest report as a full-width document with the
  // sticky left-side navigation. Earlier messages (and any non-artifact text)
  // fall back to the standard bubble renderer.
  const last = assistantMessages[assistantMessages.length - 1];
  const lastIsArtifact = looksLikeArtifact(last.content);

  return (
    <div className="h-full overflow-y-auto bg-[#f4f6fb] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        {canSave && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={onSaveQuery}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-blue-600"
              title="Save this query and response"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        )}
        {lastIsArtifact ? (
          <>
            {assistantMessages.slice(0, -1).map((m) => (
              <div key={m.id} className="mx-auto mb-6 max-w-2xl">
                <ChatMessageBubble message={m} sources={[]} bare />
              </div>
            ))}
            <PriorAuthArtifact raw={last.content} streaming={isProcessing} withNav />
          </>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
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
        )}
      </div>
    </div>
  );
}
