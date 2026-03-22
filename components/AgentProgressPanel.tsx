"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export interface AgentStage {
  tool: string;
  label: string;
  status: "running" | "done";
}

export interface AgentMessage {
  text: string;
  type: "info" | "warning";
  tool?: string;
}

interface AgentProgressPanelProps {
  isLoading: boolean;
  stages: AgentStage[];
  messages: AgentMessage[];
}

export function AgentProgressPanel({
  isLoading,
  stages,
  messages,
}: AgentProgressPanelProps) {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);
  const t1Ref = useRef<NodeJS.Timeout | null>(null);
  const t2Ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (t1Ref.current) clearTimeout(t1Ref.current);
    if (t2Ref.current) clearTimeout(t2Ref.current);

    if (!isLoading && stages.length > 0) {
      t1Ref.current = setTimeout(() => setFading(true), 50);
      t2Ref.current = setTimeout(() => setShow(false), 650);
    }

    return () => {
      if (t1Ref.current) clearTimeout(t1Ref.current);
      if (t2Ref.current) clearTimeout(t2Ref.current);
    };
  }, [isLoading, stages.length]);

  if (!show) return null;

  const hasAnyStages = stages.length > 0;
  const hasRunning = stages.some((s) => s.status === "running");

  return (
    <div
      className={cn(
        "mx-auto max-w-[768px] mb-4 px-1 transition-opacity duration-500",
        fading ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          {isLoading && hasRunning ? (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-blue-700">
            {isLoading && !hasAnyStages
              ? "Analyzing your request..."
              : isLoading
                ? "Processing authorization request..."
                : "Analysis complete"}
          </span>
        </div>

        {!hasAnyStages && isLoading && (
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            </div>
            <span className="text-sm text-gray-500 italic">
              Preparing tools...
            </span>
          </div>
        )}

        {hasAnyStages && (
          <div className="space-y-1">
            {stages.map((stage) => {
              const stageMessages = messages.filter(
                (m) => m.tool === stage.tool,
              );
              return (
                <div key={stage.tool}>
                  <div className="flex items-center gap-2.5">
                    {stage.status === "running" ? (
                      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                      </div>
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm",
                        stage.status === "done"
                          ? "text-gray-400"
                          : "text-gray-700",
                      )}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {stageMessages.map((msg, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 pl-6 mt-0.5"
                    >
                      <span
                        className={cn(
                          "text-xs",
                          msg.type === "warning"
                            ? "text-amber-600"
                            : "text-gray-400",
                        )}
                      >
                        {msg.text}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
