"use client";

import { type Message } from "ai";
import { Bookmark } from "lucide-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import {
  PriorAuthArtifact,
  looksLikeArtifact,
} from "@/components/prior-auth/artifact/PriorAuthArtifact";
import { cn } from "@/utils/cn";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import {
  latestPhase,
  stripControlFrames,
  toolLabel,
  toolStages,
} from "@/lib/priorAuth/streamFrames";

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

  // The server withholds the report until it has been checked, so for most of
  // a run there is nothing to render but progress. Reading it out of the
  // control frames is the only feedback this panel has — before buffering, the
  // report painting itself was the progress indicator.
  const latest = assistantMessages[assistantMessages.length - 1];
  const { body: latestBody, frames } = stripControlFrames(latest?.content ?? "");
  const stages = toolStages(frames).map((s) => ({
    tool: s.name,
    label: toolLabel(s.name),
    status: s.status,
  }));
  const reviewing = latestPhase(frames) === "reviewing";

  if (assistantMessages.length === 0 || (isProcessing && !latestBody)) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4">
        {isProcessing ? (
          <div className="pt-6">
            <AgentProgressPanel
              isLoading
              stages={stages}
              messages={
                reviewing
                  ? [
                      {
                        text: "Validating results…",
                        type: "info" as const,
                        tool: stages[stages.length - 1]?.tool,
                      },
                    ]
                  : []
              }
            />
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No output yet. Fill in the form and click &quot;Generate Authorization&quot; to get started.
            </p>
          </div>
        )}
      </div>
    );
  }

  // The Output tab shows the latest report as a full-width document with the
  // sticky left-side navigation. Earlier messages (and any non-artifact text)
  // fall back to the standard bubble renderer.
  const last = latest;
  const lastIsArtifact = looksLikeArtifact(latestBody);

  return (
    <div className="h-full overflow-y-auto bg-muted px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-4 flex justify-end">
          <button
            onClick={onSaveQuery}
            disabled={!canSave}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:border-border disabled:text-faint disabled:shadow-none disabled:hover:bg-card disabled:hover:text-faint",
              saved
                ? "border-success/20 text-success hover:bg-success/5 hover:text-success"
                : "border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive",
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
