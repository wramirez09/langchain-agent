"use client";

import React, { FormEvent, useRef, useState } from "react";
import { motion } from "framer-motion";
import { type Message } from "ai";
import {
  LoaderCircle,
  Trash2,
  AlertTriangle,
  Bookmark,
  Sparkles,
  Paperclip,
} from "lucide-react";
import { IconSend2 } from "@tabler/icons-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "@/components/IntermediateStep";
import { ArtifactSkeleton } from "@/components/prior-auth/artifact/ArtifactSkeleton";
import { ArtifactPendingNotice } from "@/components/prior-auth/artifact/ArtifactPendingNotice";
import { HipaaCheckToast } from "@/components/prior-auth/artifact/HipaaCheckToast";
import { NoteIngestDialog } from "@/components/note-ingest/NoteIngestDialog";
import { cn } from "@/utils/cn";
import {
  usePriorAuthChat,
  usePriorAuthUi,
} from "@/components/providers/PriorAuthProvider";

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
  /** Fires a screening from a de-identified note the user attached. */
  onNoteQuery?: (query: string) => void;
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
  onNoteQuery,
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

  // The request being screened is the newest USER message, which stops being
  // the last message the moment the assistant's placeholder is appended.
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  const checkingRequest = isProcessing && !isRestoring && lastUserIndex >= 0;

  // Attached note awaiting review. Held here rather than inside the dialog so
  // picking the same file twice in a row still re-opens it.
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <HipaaCheckToast
        active={checkingRequest}
        runKey={messages[lastUserIndex]?.id}
      />
      <NoteIngestDialog
        file={noteFile}
        onClose={() => setNoteFile(null)}
        onReady={(q) => onNoteQuery?.(q)}
      />
      <motion.div
        layout
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "flex flex-col flex-1 min-h-0 bg-card rounded-lg border border-border panel-shadow overflow-hidden",
          activeFormTab !== "chat" && "hidden md:flex",
          isLayoutSwapped && "md:order-1",
        )}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-foreground">
            Chat Assistant
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={onSaveQuery}
              disabled={!canSave}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:text-faint disabled:hover:text-faint",
                saved
                  ? "text-success hover:text-success"
                  : "text-destructive hover:text-destructive",
              )}
              title={saved ? "Saved" : "Save this query and response"}
            >
              <Bookmark className="size-3.5" strokeWidth={1} />
              {saved ? "Saved" : "Save"}
            </button>
            {messages.length > 0 && (
              <button
                onClick={onClear}
                className="flex items-center gap-1.5 text-xs text-faint hover:text-destructive transition-colors"
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
          style={{ overflowY: "scroll", maxHeight: "100%" }}
        >
          {messages.length === 0 && !isRestoring ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <div className="size-11 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <Sparkles className="size-5 text-blue-600" strokeWidth={1.75} />
              </div>
              {/* The brand book's `heading-2` (800 weight, -0.025em tracking),
                held at the bottom of its 24-38px clamp so it reads as a
                headline without overpowering a side panel.

                Gradient clause treatment, as Hero.tsx does it: `bg-gradient-to-br`
                is the book's 135deg, and in Theme B `accent-foreground` and
                `primary` resolve to the marketing site's own #60a5fa -> #3b82f6,
                so this is the source gradient without re-hardcoding it. The
                whole sentence carries it, so the ramp runs its length.

                Theme B only: that gradient on Theme A's white card measures
                2.6-3.7:1, so Theme A keeps the solid ink. */}
              <h2 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] leading-[1.15] text-foreground mb-2 dark:bg-gradient-to-br dark:from-accent-foreground dark:to-primary dark:bg-clip-text dark:text-transparent">
                Let&apos;s check your prior authorization readiness
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-5">
                Complete the request form and click &quot;Generate
                Authorization&quot; for a full coverage and documentation review
                — or ask a quick question to get started.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
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
                    className="text-left text-sm text-foreground-soft bg-muted hover:bg-primary/5 hover:text-blue-700 border border-border hover:border-primary/20 rounded-lg px-3 py-2 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => {
                if (m.role === "system")
                  return <IntermediateStep key={m.id} message={m} />;
                const sourceKey = (messages.length - 1 - i).toString();
                const isLastMessage = i === messages.length - 1;
                // The request under screening is the newest user message, which
                // is NOT the last message once the assistant's placeholder has
                // been appended.
                // Same condition the toast uses -- a saved-query restore runs
                // no screening, so neither the shimmer nor the announcement
                // belongs there.
                const phiChecking =
                  checkingRequest && m.role === "user" && i === lastUserIndex;
                return (
                  <ChatMessageBubble
                    key={m.id}
                    message={m}
                    sources={sourcesForMessages[sourceKey] as unknown[]}
                    isLastMessage={isLastMessage}
                    isLoading={isLastMessage && isProcessing}
                    phiChecking={phiChecking}
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
                  <ArtifactPendingNotice />
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border px-4 pt-3 pb-1 flex-shrink-0">
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card w-full"
          >
            <input
              ref={noteInputRef}
              type="file"
              accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setNoteFile(f);
                // Reset so re-picking the same file fires onChange again.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => noteInputRef.current?.click()}
              disabled={isProcessing}
              title="Attach a clinical note"
              aria-label="Attach a clinical note"
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Paperclip className="size-4" strokeWidth={1.75} />
            </button>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder-gray-400 outline-none"
              disabled={isProcessing}
              autoComplete="off"
            />
            <button
              type={isProcessing ? "button" : "submit"}
              onClick={isProcessing ? onStop : undefined}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                isProcessing
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
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
          <div className="mt-2 mb-2 p-1 bg-warning/5 border border-warning/20 rounded-md">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="hidden sm:flex w-4 h-4 text-warning flex-shrink-0"
                strokeWidth={1}
              />
              <p className="text-xs text-warning hidden md:block">
                <strong>HIPAA Compliance:</strong> Do not include
                patient-specific PHI such as names, dates of birth, medical
                record numbers, or other identifying information. Use generic
                descriptions only.
              </p>
            </div>
            <p className="text-xs text-warning md:hidden items-center gap-1 flex mt-1 mb-1">
              <strong>HIPAA:</strong> No PHI — generic descriptions only.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}
