"use client";

import React, { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import { useChat } from "ai/react";
import { toast } from "sonner";
import { LayoutGroup } from "framer-motion";
import { ErrorNotificationManager, useErrorNotifications } from "@/components/ErrorNotification";
import { createClient } from "@/utils/client";
import { getInsuranceProvidersOptions, type SelectOption } from "@/data/selectOptions";
import {
  usePriorAuthForm,
  usePriorAuthChat,
  usePriorAuthUi,
} from "@/components/providers/PriorAuthProvider";
import { PriorAuthTabs } from "@/components/prior-auth/PriorAuthTabs";
import { PriorAuthFormPanel } from "@/components/prior-auth/PriorAuthFormPanel";
import { PriorAuthChatPanel } from "@/components/prior-auth/PriorAuthChatPanel";
import { PriorAuthOutputPanel } from "@/components/prior-auth/PriorAuthOutputPanel";
import { createChatFetchWithRetry } from "@/lib/priorAuth/chatFetchWithRetry";

interface PriorAuthViewProps {
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
}

export function PriorAuthView({
  pendingMessage,
  onPendingMessageConsumed,
}: PriorAuthViewProps) {
  const { formFields, resetForm: resetFormFields } = usePriorAuthForm();
  const {
    setChatMessages,
    chatInput,
    setChatInput,
    isLoading,
    setIsLoading,
    setChatIsLoading,
    intermediateStepsLoading,
    setIntermediateStepsLoading,
    sourcesForMessages,
    setResponseReady,
    setSourcesForMessages,
  } = usePriorAuthChat();
  const { activeFormTab, setActiveFormTab } = usePriorAuthUi();

  const [isLayoutSwapped, setIsLayoutSwapped] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingToast1Ref = useRef<NodeJS.Timeout | null>(null);
  const loadingToast2Ref = useRef<NodeJS.Timeout | null>(null);

  const [guidelinesOptions, setGuidelinesOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? "";
      setGuidelinesOptions(getInsuranceProvidersOptions({ email, isSignedIn: !!session }));
    };
    load();
  }, []);

  // Warm up the agent lambda so the user's first submission hits a hot
  // container instead of paying cold-start latency. Best-effort — failures
  // are silently ignored; chatFetchWithRetry handles the actual retry.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chat/agents", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => { /* ignore */ });
    return () => controller.abort();
  }, []);

  const { errors, addError, dismissError, retryError } = useErrorNotifications();

  const chatFetchRef = useRef<typeof fetch | null>(null);
  if (!chatFetchRef.current) {
    chatFetchRef.current = createChatFetchWithRetry({
      onRetry: (attempt, reason) => {
        console.warn(`[chat] retry ${attempt} — ${reason}`);
      },
    });
  }

  const chat = useChat({
    api: "/api/chat/agents",
    streamMode: "text",
    fetch: chatFetchRef.current,
    onFinish(assistantMessage) {
      setIntermediateStepsLoading(false);
      setIsLoading(false);
      setChatIsLoading(false);
      // Append the assistant message via a functional setter rather than
      // copying `chat.messages`. The `chat` reference in this closure is
      // captured from a render that may predate the streamed-in message,
      // so `chat.messages` here can be empty even after a successful run —
      // which is what was leaving FileExportView with an empty array and
      // showing "No report generated yet". Using the message argument
      // bypasses the closure entirely.
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === assistantMessage.id)) return prev;
        return [...prev, assistantMessage];
      });
      // Stream completed — flip the export-ready latch true so the sidebar
      // PDF button can enable. Reset on new query / stop / clear.
      setResponseReady(true);
    },
    onError(error) {
      setIntermediateStepsLoading(false);
      setIsLoading(false);
      setChatIsLoading(false);
      try {
        let errorData: any = error;
        if (typeof error === "string") errorData = JSON.parse(error);
        if (errorData && typeof errorData === "object" && "error" in errorData) {
          addError({
            severity: errorData.retryAttempts >= 3 ? "error" : "warning",
            userMessage: errorData.error,
            technicalMessage: errorData.technicalError,
            retryAttempts: errorData.retryAttempts,
            operation: "Chat completion",
            canRetry: errorData.canRetry ?? false,
          });
        } else {
          addError({
            severity: "error",
            userMessage: "An error occurred while processing your message",
            technicalMessage: error instanceof Error ? error.message : String(error),
            operation: "Chat completion",
            canRetry: true,
          });
        }
      } catch {
        addError({
          severity: "error",
          userMessage: "An error occurred while processing your message",
          technicalMessage: String(error),
          operation: "Chat completion",
          canRetry: true,
        });
      }
      toast.error("An error occurred while processing your message");
    },
    onResponse(response) {
      try {
        const sourcesHeader = response.headers.get("x-sources");
        let sources: any[] = [];
        if (sourcesHeader) {
          try { sources = JSON.parse(sourcesHeader); } catch { sources = []; }
        }
        const messageIndexHeader = response.headers.get("x-message-index");
        if (sources.length && messageIndexHeader !== null) {
          setSourcesForMessages((prev: Record<string, any>) => ({ ...prev, [messageIndexHeader]: sources }));
        }
        const toastHeader = response.headers.get("x-toast-notifications");
        if (toastHeader) {
          try {
            const toastData = JSON.parse(toastHeader);
            if (Array.isArray(toastData)) {
              toastData.forEach(({ message, type }: { message: string; type: string }) => {
                switch (type) {
                  case "success": toast.success(message); break;
                  case "error": toast.error(message); break;
                  case "loading": toast.loading(message); break;
                  default: toast(message);
                }
              });
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    },
  });

  useEffect(() => {
    setChatMessages(chat.messages);
  }, [chat.messages, setChatMessages]);

  useEffect(() => {
    setChatIsLoading(chat.isLoading);
  }, [chat.isLoading, setChatIsLoading]);

  useEffect(() => {
    if (!pendingMessage) return;
    onPendingMessageConsumed?.();
    setIsLoading(true);
    setIntermediateStepsLoading(true);
    setResponseReady(false);
    chat.append({ role: "user", content: pendingMessage });
    setActiveFormTab("chat");
  }, [pendingMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearTimeouts = useCallback(() => {
    if (loadingToast1Ref.current) { clearTimeout(loadingToast1Ref.current); loadingToast1Ref.current = null; }
    if (loadingToast2Ref.current) { clearTimeout(loadingToast2Ref.current); loadingToast2Ref.current = null; }
  }, []);

  const handleGenerateAuth = useCallback(async () => {
    const hasFormData = Object.values(formFields).some(v => v.trim());
    if (!hasFormData && !chatInput.trim()) {
      toast.error("Please fill in at least one field before generating.");
      return;
    }

    const formEntries = [
      formFields.guidelines && `Guidelines: ${formFields.guidelines}`,
      formFields.state && `State: ${formFields.state}`,
      formFields.treatment && `Treatment: ${formFields.treatment}`,
      formFields.cptCodes && `CPT/HCPCS : ${formFields.cptCodes}`,
      formFields.diagnosis && `Diagnosis: ${formFields.diagnosis}`,
      formFields.patientHistory && `History: ${formFields.patientHistory}`,
      formFields.relevantHistory && `Relevant Medical History: ${formFields.relevantHistory}`,
    ].filter(Boolean);

    const formString = formEntries.join(". ");
    const combined = [formString, chatInput.trim()].filter(Boolean).join(" | ");
    if (!combined) return;

    setIsLoading(true);
    setIntermediateStepsLoading(true);
    setResponseReady(false);
    setActiveFormTab("chat");
    toast.info("Sending request to our AI agent");

    loadingToast1Ref.current = setTimeout(() => toast.info("Processing your request"), 20000);
    loadingToast2Ref.current = setTimeout(() => toast.info("Still processing your request"), 60000);

    try {
      setChatInput("");
      await chat.append({ role: "user", content: combined });
    } catch (error) {
      if ((error as any)?.name !== "AbortError") {
        toast.error("Failed to send message", { description: (error as any)?.message });
      }
    } finally {
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    }
  }, [formFields, chatInput, chat, clearTimeouts, setIsLoading, setIntermediateStepsLoading, setChatInput, setActiveFormTab]);

  const handleChatInputSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || chat.isLoading || intermediateStepsLoading) return;

    const message = chatInput.trim();
    setChatInput("");
    setIsLoading(true);
    setIntermediateStepsLoading(true);
    setResponseReady(false);
    toast.info("Sending request to our AI agent");

    loadingToast1Ref.current = setTimeout(() => toast.info("Processing your request"), 20000);
    loadingToast2Ref.current = setTimeout(() => toast.info("Still processing your request"), 60000);

    try {
      await chat.append({ role: "user", content: message });
    } catch (error) {
      if ((error as any)?.name !== "AbortError") {
        toast.error("Failed to send message");
      }
    } finally {
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    }
  }, [chatInput, chat, intermediateStepsLoading, clearTimeouts, setChatInput, setIntermediateStepsLoading, setIsLoading]);

  const handleStop = useCallback(() => {
    chat.stop();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimeouts();
    setIsLoading(false);
    setIntermediateStepsLoading(false);
    setChatIsLoading(false);
    setResponseReady(false);
    toast.info("Request stopped");
  }, [chat, clearTimeouts, setIsLoading, setIntermediateStepsLoading, setChatIsLoading, setResponseReady]);

  const clearChat = useCallback(() => {
    if (chat.isLoading) {
      chat.stop();
      abortControllerRef.current?.abort();
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
      setResponseReady(false);
      toast.info("Request stopped");
      return;
    }
    chat.setMessages([]);
    setSourcesForMessages({});
    resetFormFields();
    setChatInput("");
    setResponseReady(false);
    toast.success("Chat cleared successfully");
  }, [chat, clearTimeouts, resetFormFields, setIntermediateStepsLoading, setIsLoading, setSourcesForMessages, setChatInput, setResponseReady]);

  const isProcessing = chat.isLoading || intermediateStepsLoading || isLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ErrorNotificationManager errors={errors} onRetry={retryError} onDismiss={dismissError} />

      <PriorAuthTabs
        isLayoutSwapped={isLayoutSwapped}
        setIsLayoutSwapped={setIsLayoutSwapped}
      />

      <div className="flex-1 overflow-hidden">
        {(activeFormTab === "pre-auth" || activeFormTab === "chat" || activeFormTab === "input") && (
          <LayoutGroup>
            <div className="h-full flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 overflow-hidden relative">
              <PriorAuthFormPanel
                guidelinesOptions={guidelinesOptions}
                isProcessing={isProcessing}
                isLayoutSwapped={isLayoutSwapped}
                onGenerate={handleGenerateAuth}
                onCancel={isProcessing ? handleStop : clearChat}
              />
              <PriorAuthChatPanel
                messages={chat.messages}
                sourcesForMessages={sourcesForMessages}
                isProcessing={isProcessing}
                isLayoutSwapped={isLayoutSwapped}
                onSubmit={handleChatInputSubmit}
                onStop={handleStop}
                onClear={clearChat}
              />
            </div>
          </LayoutGroup>
        )}

        {activeFormTab === "output" && (
          <PriorAuthOutputPanel messages={chat.messages} isProcessing={isProcessing} />
        )}
      </div>
    </div>
  );
}
