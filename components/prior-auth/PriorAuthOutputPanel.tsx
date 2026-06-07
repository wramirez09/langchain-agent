"use client";

import { type Message } from "ai";
import { Bookmark } from "lucide-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import {
  PriorAuthArtifact,
  looksLikeArtifact,
} from "@/components/prior-auth/artifact/PriorAuthArtifact";
import { cn } from "@/utils/cn";

interface PriorAuthOutputPanelProps {
  messages: Message[];
  isProcessing: boolean;
  canSave?: boolean;
  saved?: boolean;
  onSaveQuery?: () => void;
}

export function PriorAuthOutputPanel({
  messages,
  isProcessing,
  canSave,
  saved,
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
        <div className="mb-4 flex justify-end">
          <button
            onClick={onSaveQuery}
            disabled={!canSave}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:shadow-none disabled:hover:bg-white disabled:hover:text-gray-300",
              saved
                ? "border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700"
                : "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",
            )}
            title={saved ? "Saved" : "Save this query and response"}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
        {lastIsArtifact ? (
          <>
            {assistantMessages.slice(0, -1).map((m) => (
              <div key={m.id} className="mx-auto mb-6 max-w-2xl">
                <ChatMessageBubble message={m} sources={[]} bare />
              </div>
            ))}
            <PriorAuthArtifact
              raw={last.content}
              streaming={isProcessing}
              withNav
              messageId={last.id}
            />
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
