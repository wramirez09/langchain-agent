"use client";

import React, { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import { type Message } from "ai";
import { useChat } from "ai/react";
import { toast } from "sonner";
import { Activity, AlertTriangle, BookOpen, ClipboardList, FileBarChart, FileText, LoaderCircle, MapPin, Send, Stethoscope, Trash2 } from "lucide-react";
import { IconSend2 } from "@tabler/icons-react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "@/components/IntermediateStep";
import { ErrorNotificationManager, useErrorNotifications } from "@/components/ErrorNotification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { cn } from "@/utils/cn";
import { createClient } from "@/utils/client";
import { data as stateData } from "@/app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";
import { getInsuranceProvidersOptions, type SelectOption } from "@/data/selectOptions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const stateOptions = stateData.map((s) => ({ value: s.description, label: s.description }));

interface PriorAuthViewProps {
  onMessagesChange?: (messages: Message[]) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
}

export function PriorAuthView({
  onMessagesChange,
  pendingMessage,
  onPendingMessageConsumed,
}: PriorAuthViewProps) {
  const [activeTab, setActiveTab] = useState<"pre-auth" | "chat" | "input" | "output">("pre-auth");
  const [sourcesForMessages, setSourcesForMessages] = useState<Record<string, any>>({});
  const [formContent, setFormContent] = useState<Map<string, string>>(new Map());
  const [intermediateStepsLoading, setIntermediateStepsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [formResetKey, setFormResetKey] = useState(0);
  const [selectedGuideline, setSelectedGuideline] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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

  const { errors, addError, dismissError, retryError } = useErrorNotifications();

  const chat = useChat({
    api: "/api/chat/agents",
    streamMode: "text",
    onFinish() {
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    },
    onError(error) {
      setIntermediateStepsLoading(false);
      setIsLoading(false);
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
          setSourcesForMessages((prev) => ({ ...prev, [messageIndexHeader]: sources }));
        }
        const toastHeader = response.headers.get("x-toast-notifications");
        if (toastHeader) {
          try {
            const toastData = JSON.parse(toastHeader);
            if (Array.isArray(toastData)) {
              toastData.forEach(({ message, type }: { message: string; type: string }) => {
                switch (type) {
                  case "success": toast.success(message); break;
                  case "error":   toast.error(message); break;
                  case "loading": toast.loading(message); break;
                  default:        toast(message);
                }
              });
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    },
  });

  // Notify parent of message changes
  useEffect(() => {
    onMessagesChange?.(chat.messages);
  }, [chat.messages, onMessagesChange]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [chat.messages]);

  // Consume pending message from upload flow
  useEffect(() => {
    if (!pendingMessage) return;
    onPendingMessageConsumed?.();
    setIsLoading(true);
    setIntermediateStepsLoading(true);
    chat.append({ role: "user", content: pendingMessage });
    setActiveTab("chat");
  }, [pendingMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearTimeouts = useCallback(() => {
    if (loadingToast1Ref.current) { clearTimeout(loadingToast1Ref.current); loadingToast1Ref.current = null; }
    if (loadingToast2Ref.current) { clearTimeout(loadingToast2Ref.current); loadingToast2Ref.current = null; }
  }, []);

  const handleFormStateChange = useCallback((key: string, value: string) => {
    setFormContent((prev) => new Map(prev).set(key, value));
    
    // Track guideline selection and clear state if Commercial is selected
    if (key === "Guidelines") {
      setSelectedGuideline(value);
      if (value === "Commercial") {
        setFormContent((prev) => {
          const newMap = new Map(prev);
          newMap.set("State", "");
          return newMap;
        });
      }
    }
  }, []);

  const handleGenerateAuth = useCallback(async () => {
    if (formContent.size === 0 && !chatInput.trim()) {
      toast.error("Please fill in at least one field before generating.");
      return;
    }
    const formString = Array.from(formContent.entries())
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(". ");
    const combined = [formString, chatInput.trim()].filter(Boolean).join(" | ");
    if (!combined) return;

    setIsLoading(true);
    setIntermediateStepsLoading(true);
    toast.info("Sending request to our AI agent");

    loadingToast1Ref.current = setTimeout(() => toast.info("Processing your request"), 20000);
    loadingToast2Ref.current = setTimeout(() => toast.info("Still processing your request"), 60000);

    try {
      setChatInput("");
      await chat.append({ role: "user", content: combined });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        toast.error("Failed to send message", { description: error?.message });
      }
    } finally {
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    }
  }, [formContent, chatInput, chat, clearTimeouts]);

  const handleChatInputSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || chat.isLoading || intermediateStepsLoading) return;

    const message = chatInput.trim();
    setChatInput("");
    setIsLoading(true);
    setIntermediateStepsLoading(true);
    toast.info("Sending request to our AI agent");

    loadingToast1Ref.current = setTimeout(() => toast.info("Processing your request"), 20000);
    loadingToast2Ref.current = setTimeout(() => toast.info("Still processing your request"), 60000);

    try {
      await chat.append({ role: "user", content: message });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        toast.error("Failed to send message");
      }
    } finally {
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
    }
  }, [chatInput, chat, intermediateStepsLoading, clearTimeouts]);

  const handleStop = useCallback(() => {
    chat.stop();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimeouts();
    setIsLoading(false);
    setIntermediateStepsLoading(false);
    toast.info("Request stopped");
  }, [chat, clearTimeouts]);

  const clearChat = useCallback(() => {
    if (chat.isLoading) {
      chat.stop();
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearTimeouts();
      setIsLoading(false);
      setIntermediateStepsLoading(false);
      toast.info("LLM request cancelled");
    }
    chat.setMessages([]);
    setSourcesForMessages({});
    setFormContent(new Map());
    setChatInput("");
    setFormResetKey((k) => k + 1);
    toast.success("Chat cleared successfully");
  }, [chat, clearTimeouts]);

  const isProcessing = chat.isLoading || intermediateStepsLoading || isLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ErrorNotificationManager errors={errors} onRetry={retryError} onDismiss={dismissError} />

      {/* Tabs — floating on gray background */}
      <div className="px-4 md:px-6 pt-4 pb-0 flex-shrink-0">
        <div className="flex border-b border-gray-200">
          {/* Mobile tabs: Pre-Auth | Chat | Input | Output */}
          {(["pre-auth", "chat", "input", "output"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "md:hidden px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {tab === "pre-auth" ? "Pre-Auth" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {/* Desktop tabs: Input | Output */}
          <button
            onClick={() => setActiveTab("input")}
            className={cn(
              "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab !== "output"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            Input
          </button>
          <button
            onClick={() => setActiveTab("output")}
            className={cn(
              "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "output"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            Output
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop Input tab and mobile Pre-Auth/Chat tabs all share card layout */}
        {(activeTab === "pre-auth" || activeTab === "chat" || activeTab === "input") && (
          <div className="h-full flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 overflow-hidden">

            {/* Mobile Input placeholder — shown only on mobile when Input tab is active */}
            {activeTab === "input" && (
              <div className="md:hidden flex-1 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col items-center justify-center p-8 text-center">
                <div className="size-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="size-7 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Use Pre-Auth or Chat Tabs</h3>
                <p className="text-xs text-gray-500">Access the form in the Pre-Auth tab or start a conversation in the Chat tab</p>
              </div>
            )}

            {/* Left card — Request Details (mobile: pre-auth tab only; desktop: always) */}
            <div className={cn(
              "flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm flex-col overflow-hidden",
              activeTab === "pre-auth" ? "flex" : "hidden md:flex",
            )}>
              <div className="px-6 pt-6 pb-2 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900">Request Details</h3>
              </div>

              {/* Form fields */}
              <div key={formResetKey} className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 pt-2 space-y-5">

                {/* Row: Guidelines + State */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                      <FileText size={13} color="#2563EB" />
                      Guidelines
                    </label>
                    <Select
                      isClearable
                      options={guidelinesOptions}
                      onChange={(v) => handleFormStateChange("Guidelines", v?.value ?? "")}
                      placeholder="Select..."
                      classNamePrefix="react-select"
                      styles={{
                        control: (base) => ({
                          ...base,
                          minHeight: "36px",
                          fontSize: "14px",
                          borderColor: "#e2e8f0",
                          borderRadius: "8px",
                          "&:hover": { borderColor: "#bfdbfe" },
                        }),
                        menu: (base) => ({ ...base, borderRadius: "8px", overflow: "hidden" }),
                      }}
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                      <MapPin size={13} color="#059669" />
                      State
                    </label>
                    <Select
                      isClearable
                      isDisabled={selectedGuideline === "Commercial"}
                      options={stateOptions}
                      onChange={(v) => handleFormStateChange("State", v?.value ?? "")}
                      placeholder="Select..."
                      classNamePrefix="react-select"
                      styles={{
                        control: (base) => ({
                          ...base,
                          minHeight: "36px",
                          fontSize: "14px",
                          borderColor: "#e2e8f0",
                          borderRadius: "8px",
                          "&:hover": { borderColor: "#bfdbfe" },
                          opacity: selectedGuideline === "Commercial" ? 0.5 : 1,
                          cursor: selectedGuideline === "Commercial" ? "not-allowed" : "default",
                        }),
                        menu: (base) => ({ ...base, borderRadius: "8px", overflow: "hidden" }),
                      }}
                    />
                    {selectedGuideline === "Commercial" && (
                      <p className="text-xs text-gray-500 mt-1">
                        State selection not required for Commercial guidelines
                      </p>
                    )}
                  </div>
                </div>

                {/* Row: Pre-Auth Request + CPT Code(s) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                      <Stethoscope size={13} color="#7C3AED" />
                      Pre-Auth Request
                    </label>
                    <CreatableSelect
                      isClearable
                      options={ncdOptions}
                      onChange={(v) => handleFormStateChange("Treatment", v?.value ?? "")}
                      placeholder="Select..."
                      classNamePrefix="react-select"
                      styles={{
                        control: (base) => ({
                          ...base,
                          minHeight: "36px",
                          fontSize: "14px",
                          borderColor: "#e2e8f0",
                          borderRadius: "8px",
                          "&:hover": { borderColor: "#bfdbfe" },
                        }),
                        menu: (base) => ({ ...base, borderRadius: "8px", overflow: "hidden" }),
                      }}
                    />
                    <p className="text-xs text-gray-400 mt-1">*Can&apos;t find what you&apos;re looking for? Type to create a new option</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                      <FileBarChart size={13} color="#4F46E5" />
                      CPT Code(s)
                    </label>
                    <Input
                      placeholder="CPT Codes"
                      className="h-9 bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400"
                      onChange={(e) => handleFormStateChange("CPT code(s)", e.target.value)}
                    />
                  </div>
                </div>

                {/* Diagnosis */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                    <Activity size={13} color="#F97316" />
                    Diagnosis
                  </label>
                  <Textarea
                    placeholder="knee pain"
                    className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                    onChange={(e) => handleFormStateChange("Diagnosis", e.target.value)}
                  />
                </div>

                {/* History accordion */}
                <Accordion type="multiple" className="w-full space-y-2">
                  <AccordionItem value="patient-history" className="border border-gray-200 rounded-lg px-3 py-0">
                    <AccordionTrigger className="hover:no-underline py-3 text-xs font-semibold text-gray-900">
                      <span className="flex items-center gap-1.5">
                        <ClipboardList size={13} color="#F43F5E" />
                        Patient(s) Medical History
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0">
                      <Textarea
                        placeholder="knee swelling for over 3 weeks."
                        className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                        onChange={(e) => handleFormStateChange("History", e.target.value)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="relevant-history" className="border border-gray-200 rounded-lg px-3 py-0">
                    <AccordionTrigger className="hover:no-underline py-3 text-xs font-semibold text-gray-900">
                      <span className="flex items-center gap-1.5">
                        <BookOpen size={13} color="#0EA5E9" />
                        Relevant Medical History
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0">
                      <Textarea
                        placeholder="previous knee pain, swelling, etc."
                        className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                        onChange={(e) => handleFormStateChange("Relevant Medical History", e.target.value)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Generate button */}
              <div className="px-6 pb-6 pt-4 flex-shrink-0">
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <strong>HIPAA Compliance:</strong> Do not include patient-specific PHI such as names, dates of birth, medical record numbers, or other identifying information. Use generic descriptions only.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleGenerateAuth}
                    disabled={isProcessing}
                    className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <LoaderCircle className="animate-spin size-4" />
                        Generating…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Send className="size-4" />
                        Generate Authorization
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={isProcessing ? handleStop : clearChat}
                    className="h-11 px-4 text-red-500 hover:text-red-600 hover:bg-red-50 font-medium text-sm rounded-lg border border-red-200"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>

            {/* Right card — Chat Assistant (mobile: chat tab only; desktop: always) */}
            <div className={cn(
              "flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm flex-col overflow-hidden",
              activeTab === "chat" ? "flex" : "hidden md:flex",
            )}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900">Chat Assistant</h3>
                {chat.messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    title="Clear chat"
                  >
                    <Trash2 className="size-3.5" />
                    Clear
                  </button>
                )}
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {chat.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                    <div className="size-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                      <span className="text-sm font-bold text-blue-600">AI</span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Hello! I&apos;m here to help you with your prior authorization request.
                    </p>
                    <p className="text-xs text-gray-400">
                      Fill in the form and click &quot;Generate Authorization&quot;, or type a question below.
                    </p>
                  </div>
                ) : (
                  chat.messages.map((m, i) => {
                    if (m.role === "system") {
                      return <IntermediateStep key={m.id} message={m} />;
                    }
                    const sourceKey = (chat.messages.length - 1 - i).toString();
                    const isLastMessage = i === chat.messages.length - 1;
                    return (
                      <ChatMessageBubble
                        key={m.id}
                        message={m}
                        sources={sourcesForMessages[sourceKey] as unknown[]}
                        isLastMessage={isLastMessage}
                        isLoading={isLastMessage && isProcessing}
                      />
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-gray-100 px-4 pt-3 pb-4 flex-shrink-0">
                <form
                  onSubmit={handleChatInputSubmit}
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
                    onClick={isProcessing ? handleStop : undefined}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                      isProcessing
                        ? "bg-red-100 text-red-500 hover:bg-red-200"
                        : "bg-blue-600 text-white hover:bg-blue-700",
                    )}
                  >
                    {isProcessing ? (
                      <LoaderCircle className="animate-spin size-4" />
                    ) : (
                      <IconSend2 className="size-2" strokeWidth={2} size={20}/>
                    )}
                  </button>
                </form>
                <div className="mt-2 flex items-center gap-1.5 ml-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-amber-700">Do not include patient PHI. Use generic descriptions only.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "output" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              {chat.messages.filter((m) => m.role === "assistant" && m.content).length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
                  <p className="text-sm text-gray-500">No output yet. Fill in the form and click &quot;Generate Authorization&quot; to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chat.messages
                    .filter((m) => m.role === "assistant" && m.content)
                    .map((m, i, arr) => (
                      <div key={m.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                        {i === arr.length - 1 && (
                          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Latest Response</div>
                        )}
                        <ChatMessageBubble
                          message={m}
                          sources={[]}
                          isLastMessage={i === arr.length - 1}
                          isLoading={i === arr.length - 1 && isProcessing}
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
