"use client";

import React, { FormEvent, useRef } from "react";
import { motion } from "framer-motion";
import { type Message } from "ai";
import { LoaderCircle, Trash2, AlertTriangle, Bookmark, Sparkles } from "lucide-react";
import { IconSend2 } from "@tabler/icons-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "@/components/IntermediateStep";
import { ArtifactSkeleton } from "@/components/prior-auth/artifact/ArtifactSkeleton";
import { cn } from "@/utils/cn";
import { usePriorAuthChat, usePriorAuthUi } from "@/components/providers/PriorAuthProvider";

interface PriorAuthChatPanelProps {
  messages: Message[];
  sourcesForMessages: Record<string, any>;
  isProcessing: boolean;
  /** A saved query is being re-applied: show an artifact skeleton below the
   * restored user request until the full turn swaps in. */
  isRestoring?: boolean;
  isLayoutSwapped: boolean;
  onSubmit: (e?: FormEvent) => void;
  onStop: () => void;
  onClear: () => void;
  canSave?: boolean;
  saved?: boolean;
  onSaveQuery?: () => void;
}

export function PriorAuthChatPanel({
  messages,
  sourcesForMessages,
  isProcessing,
  isRestoring,
  isLayoutSwapped,
  onSubmit,
  onStop,
  onClear,
  canSave,
  saved,
  onSaveQuery,
}: PriorAuthChatPanelProps) {
  const { chatInput, setChatInput } = usePriorAuthChat();
  const { activeFormTab } = usePriorAuthUi();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // A generation is in flight but the artifact hasn't started streaming yet:
  // the last message is still the user's request (or an intermediate step).
  // Show the same skeleton as the restore path so the wait reads identically;
  // it drops out the moment the assistant message starts streaming in.
  const lastMessage = messages[messages.length - 1];
  const awaitingArtifact =
    isProcessing &&
    !isRestoring &&
    messages.length > 0 &&
    lastMessage?.role !== "assistant";

  return (
    <motion.div
      layout
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "flex flex-col flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden",
        activeFormTab !== "chat" && "hidden md:flex",
        isLayoutSwapped && "md:order-1"
      )}
    >
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Chat Assistant</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={onSaveQuery}
            disabled={!canSave}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:text-gray-300",
              saved
                ? "text-green-600 hover:text-green-700"
                : "text-red-600 hover:text-red-700",
            )}
            title={saved ? "Saved" : "Save this query and response"}
          >
            <Bookmark className="size-3.5" strokeWidth={1} />
            {saved ? "Saved" : "Save"}
          </button>
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="size-3.5" strokeWidth={1} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 px-4 py-4 space-y-3"
        style={{ overflowY: 'scroll', maxHeight: '100%' }}
      >
        {messages.length === 0 && !isRestoring ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="size-11 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <Sparkles className="size-5 text-blue-600" strokeWidth={1.75} />
            </div>
            <p className="text-md font-semibold text-gray-800 mb-1">
              Let&apos;s check your prior authorization readiness
            </p>
            <p className="text-sm text-gray-500 max-w-sm mb-5">
              Complete the request form and click &quot;Generate Authorization&quot; for a
              full coverage and documentation review — or ask a quick question to get
              started.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Try asking
              </p>
              {[
                "What documentation does Medicare require for a lumbar spine MRI?",
                "Is prior authorization required for a knee arthroscopy?",
                "What are common denial reasons for a lumbar epidural steroid injection?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setChatInput(prompt)}
                  className="text-left text-sm text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 rounded-lg px-3 py-2 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
              if (m.role === "system") return <IntermediateStep key={m.id} message={m} />;
              const sourceKey = (messages.length - 1 - i).toString();
              const isLastMessage = i === messages.length - 1;
              return (
                <ChatMessageBubble
                  key={m.id}
                  message={m}
                  sources={sourcesForMessages[sourceKey] as unknown[]}
                  isLastMessage={isLastMessage}
                  isLoading={isLastMessage && isProcessing}
                />
              );
            })}
            {isRestoring && (
              <div data-testid="restore-skeleton" className="pt-1">
                <ArtifactSkeleton />
              </div>
            )}
            {awaitingArtifact && (
              <div data-testid="pending-skeleton" className="pt-1">
                <ArtifactSkeleton />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-100 px-4 pt-3 pb-1 flex-shrink-0">
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white w-full"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            disabled={isProcessing}
            autoComplete="off"
          />
          <button
            type={isProcessing ? "button" : "submit"}
            onClick={isProcessing ? onStop : undefined}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              isProcessing
                ? "bg-red-100 text-red-500 hover:bg-red-200"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {isProcessing ? (
              <LoaderCircle className="animate-spin size-4" strokeWidth={1} />
            ) : (
              <IconSend2 className="size-2" strokeWidth={1} size={20} />
            )}
          </button>
        </form>
        <div className="mt-2 mb-2 p-1 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="hidden sm:flex w-4 h-4 text-amber-600 flex-shrink-0" strokeWidth={1} />
            <p className="text-xs text-amber-800 hidden md:block">
              <strong>HIPAA Compliance:</strong> Do not include patient-specific PHI such as names, dates of birth, medical record numbers, or other identifying information. Use generic descriptions only.
            </p>
          </div>
          <p className="text-xs text-amber-800 md:hidden items-center gap-1 flex mt-1 mb-1">
            <strong>HIPAA:</strong> No PHI — generic descriptions only.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
