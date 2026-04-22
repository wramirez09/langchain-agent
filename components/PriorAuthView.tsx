"use client";

import React, { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import { useChat } from "ai/react";
import { toast } from "sonner";
import { Send, LoaderCircle, FileText, MapPin, Stethoscope, FileBarChart, Activity, ClipboardList, BookOpen, Trash2, AlertTriangle } from "lucide-react";
import { IconSend2 } from "@tabler/icons-react";
import { motion, LayoutGroup } from "framer-motion";
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
import { usePriorAuthContext } from "@/components/providers/PriorAuthProvider";

const stateOptions = stateData.map((s) => ({ value: s.description, label: s.description }));

interface PriorAuthViewProps {
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
}

export function PriorAuthView({
  pendingMessage,
  onPendingMessageConsumed,
}: PriorAuthViewProps) {
  // Get state from context
  const {
    formFields,
    updateFormField,
    openAccordions,
    setOpenAccordions,
    setChatMessages,
    chatInput,
    setChatInput,
    isLoading,
    setIsLoading,
    intermediateStepsLoading,
    setIntermediateStepsLoading,
    sourcesForMessages,
    setSourcesForMessages,
    activeFormTab,
    setActiveFormTab,
    resetForm,
  } = usePriorAuthContext();

  // Local UI state (not persisted)
  const [isLayoutSwapped, setIsLayoutSwapped] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingToast1Ref = useRef<NodeJS.Timeout | null>(null);
  const loadingToast2Ref = useRef<NodeJS.Timeout | null>(null);
  const patientHistoryRef = useRef<HTMLDivElement>(null);
  const relevantHistoryRef = useRef<HTMLDivElement>(null);

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
      // Sync with context
      setChatMessages(chat.messages);
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

  // Sync chat messages with context
  useEffect(() => {
    setChatMessages(chat.messages);
  }, [chat.messages, setChatMessages]);

  // Auto-scroll to bottom on new messages - DISABLED to allow manual scrolling
  // useEffect(() => {
  //   const container = messagesContainerRef.current;
  //   if (container) container.scrollTop = container.scrollHeight;
  // }, [chat.messages]);

  // Consume pending message from upload flow
  useEffect(() => {
    if (!pendingMessage) return;
    onPendingMessageConsumed?.();
    setIsLoading(true);
    setIntermediateStepsLoading(true);
    chat.append({ role: "user", content: pendingMessage });
    setActiveFormTab("chat");
  }, [pendingMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearTimeouts = useCallback(() => {
    if (loadingToast1Ref.current) { clearTimeout(loadingToast1Ref.current); loadingToast1Ref.current = null; }
    if (loadingToast2Ref.current) { clearTimeout(loadingToast2Ref.current); loadingToast2Ref.current = null; }
  }, []);

  const handleFormStateChange = useCallback((key: string, value: string) => {
    // Map old keys to new context field names
    const fieldMap: Record<string, keyof typeof formFields> = {
      "Guidelines": "guidelines",
      "State": "state",
      "Treatment": "treatment",
      "CPT/HCPCS ": "cptCodes",
      "Diagnosis": "diagnosis",
      "History": "patientHistory",
      "Relevant Medical History": "relevantHistory",
    };

    const field = fieldMap[key];
    if (field) {
      updateFormField(field, value);
    }

    // Clear state if Commercial is selected
    if (key === "Guidelines" && value === "Commercial") {
      updateFormField("state", "");
    }
  }, [updateFormField]);

  const handleGenerateAuth = useCallback(async () => {
    // Check if any form field has a value
    const hasFormData = Object.values(formFields).some(v => v.trim());
    if (!hasFormData && !chatInput.trim()) {
      toast.error("Please fill in at least one field before generating.");
      return;
    }

    // Build form string from context formFields
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
  }, [formFields, chatInput, chat, clearTimeouts, setIsLoading, setIntermediateStepsLoading, setChatInput]);

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
    toast.info("Request stopped");
  }, [chat, clearTimeouts, setIsLoading, setIntermediateStepsLoading]);

  const clearChat = useCallback(() => {
    if (chat.isLoading) {
      chat.stop();
      abortControllerRef.current?.abort();
      clearTimeouts();
      setIntermediateStepsLoading(false);
      setIsLoading(false);
      toast.info("Request stopped");
      return;
    }
    chat.setMessages([]);
    setSourcesForMessages({});
    resetForm();
    toast.success("Chat cleared successfully");
  }, [chat, clearTimeouts, resetForm, setIntermediateStepsLoading, setIsLoading, setSourcesForMessages]);

  const isProcessing = chat.isLoading || intermediateStepsLoading || isLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ErrorNotificationManager errors={errors} onRetry={retryError} onDismiss={dismissError} />

      {/* Tabs — floating on gray background */}
      <div className="px-4 md:px-6 pt- pb-0 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-gray-200">
          <div className="flex">
            {/* Mobile tabs: Pre-Auth | Chat | Output */}
            {(["pre-auth", "chat", "output"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFormTab(tab)}
                className={cn(
                  "md:hidden px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeFormTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700",
                )}
              >
                {tab === "pre-auth" ? "Pre-Auth" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            {/* Desktop tabs: Input | Output */}
            <button
              onClick={() => setActiveFormTab("input")}
              className={cn(
                "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeFormTab !== "output"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              Input
            </button>
            <button
              onClick={() => setActiveFormTab("output")}
              className={cn(
                "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeFormTab === "output"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              Output
            </button>
          </div>

          {/* Toggle Switch - Desktop only, inline with tabs, flush right */}
          <div className="hidden md:flex items-center pb-3">
            <button
              onClick={() => setIsLayoutSwapped(!isLayoutSwapped)}
              className="flex items-center gap-2.5 px-3 py-1.5 mt-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-all duration-200 group"
              title="Swap layout positions"
            >
              <span className={cn(
                "text-xs font-medium transition-colors duration-200",
                isLayoutSwapped ? "text-blue-600" : "text-gray-700"
              )}>
                Swap Layout
              </span>
              <div className={cn(
                "relative w-9 h-5 rounded-full transition-all duration-300",
                isLayoutSwapped ? "bg-blue-600" : "bg-gray-300"
              )}>
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300",
                  isLayoutSwapped && "translate-x-4"
                )}>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop Input tab and mobile Pre-Auth/Chat tabs all share card layout */}
        {(activeFormTab === "pre-auth" || activeFormTab === "chat" || activeFormTab === "input") && (
          <LayoutGroup>
            <div className="h-full flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 overflow-hidden relative">

              {/* Left card — Request Details (mobile: pre-auth tab only; desktop: always) */}
              <motion.div
                layout
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  "flex flex-col flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden",
                  activeFormTab !== "pre-auth" && "hidden md:flex",
                  isLayoutSwapped && "md:order-2"
                )}
              >
                <div className="px-6 pt-6 pb-2 flex-shrink-0 bottom-1 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Request Details</h3>
                </div>

                {/* Form fields */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 pt-2 space-y-5">

                  {/* Row: Guidelines + State */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                        <FileText size={13} color="#2563EB" />
                        Guidelines
                      </label>
                      <Select
                        isClearable
                        options={guidelinesOptions}
                        value={guidelinesOptions.find(opt => opt.value === formFields.guidelines) || null}
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
                        isDisabled={formFields.guidelines === "Commercial"}
                        options={stateOptions}
                        value={stateOptions.find(opt => opt.value === formFields.state) || null}
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
                            opacity: formFields.guidelines === "Commercial" ? 0.5 : 1,
                            cursor: formFields.guidelines === "Commercial" ? "not-allowed" : "default",
                          }),
                          menu: (base) => ({ ...base, borderRadius: "8px", overflow: "hidden" }),
                        }}
                      />
                      {formFields.guidelines === "Commercial" && (
                        <p className="text-xs text-gray-500 mt-1">
                          State selection not required for Commercial guidelines
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row: Pre-Auth Request + CPT/HCPCS  */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                        <Stethoscope size={13} color="#7C3AED" />
                        Pre-Auth Request
                      </label>
                      <CreatableSelect
                        isClearable
                        options={ncdOptions}
                        value={formFields.treatment ? { value: formFields.treatment, label: formFields.treatment } : null}
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
                        CPT/HCPCS
                      </label>
                      <Input
                        placeholder="CPT Codes"
                        value={formFields.cptCodes}
                        className="h-9 bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300 focus-visible:border-blue-400"
                        onChange={(e) => handleFormStateChange("CPT/HCPCS ", e.target.value)}
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
                      value={formFields.diagnosis}
                      className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                      onChange={(e) => handleFormStateChange("Diagnosis", e.target.value)}
                    />
                  </div>

                  {/* History accordion */}
                  <Accordion
                    type="multiple"
                    className="w-full space-y-2"
                    value={openAccordions}
                    onValueChange={(value) => {
                      setOpenAccordions(value);
                      // Scroll to the newly opened accordion after a short delay
                      setTimeout(() => {
                        if (value.includes('patient-history') && !openAccordions.includes('patient-history')) {
                          patientHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        if (value.includes('relevant-history') && !openAccordions.includes('relevant-history')) {
                          relevantHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 150);
                    }}
                  >
                    <AccordionItem value="patient-history" className="border border-gray-200 rounded-lg px-3 py-0" ref={patientHistoryRef}>
                      <AccordionTrigger className="hover:no-underline py-3 text-xs font-semibold text-gray-900">
                        <span className="flex items-center gap-1.5">
                          <ClipboardList size={13} color="#F43F5E" />
                          Patient(s) Medical History
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0">
                        <Textarea
                          placeholder="knee swelling for over 3 weeks."
                          value={formFields.patientHistory}
                          className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                          onChange={(e) => handleFormStateChange("History", e.target.value)}
                        />
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="relevant-history" className="border border-gray-200 rounded-lg px-3 py-0" ref={relevantHistoryRef}>
                      <AccordionTrigger className="hover:no-underline py-3 text-xs font-semibold text-gray-900">
                        <span className="flex items-center gap-1.5">
                          <BookOpen size={13} color="#0EA5E9" />
                          Relevant Medical History
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0">
                        <Textarea
                          placeholder="previous knee pain, swelling, etc."
                          value={formFields.relevantHistory}
                          className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
                          onChange={(e) => handleFormStateChange("Relevant Medical History", e.target.value)}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                {/* Generate button */}
                <div className="px-6 pb-1 pt-4 flex-shrink-0 top-1 bg-white border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={handleGenerateAuth}
                      disabled={isProcessing || !formFields.guidelines}
                      className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg"
                    >
                      {isProcessing ? (
                        <span className="flex items-center gap-2">
                          <LoaderCircle className="animate-spin size-4" />
                          Generating…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Send size={20} />
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
                  <p className="text-center text-xs text-gray-300 mt-3">
                    © {new Date().getFullYear()} NoteDoctor.Ai. All rights reserved.
                  </p>
                </div>
              </motion.div>

              {/* Right card — Chat Assistant (mobile: chat tab only; desktop: always) */}
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
                <div
                  ref={messagesContainerRef}
                  className="flex-1 min-h-0 px-4 py-4 space-y-3"
                  style={{
                    overflowY: 'scroll',
                    maxHeight: '100%'
                  }}
                >
                  {chat.messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                      <div className="size-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                        <span className="text-sm font-bold text-blue-600 p-3">NoteDoctor.Ai</span>
                      </div>
                      <p className="text-md font-medium text-gray-700 mb-1">
                        Hello! I&apos;m here to help you with your prior authorization request.
                      </p>
                      <p className="text-sm text-gray-400">
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
                <div className="border-t border-gray-100 px-4 pt-3 pb-1 flex-shrink-0">
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
                        <IconSend2 className="size-2" strokeWidth={2} size={20} />
                      )}
                    </button>
                  </form>
                  <div className="mt-2 mb-2 p-1 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="hidden sm:flex w-4 h-4 text-amber-600 flex-shrink-0" />
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
            </div>
          </LayoutGroup>
        )}

        {activeFormTab === "output" && (
          <div className="h-full overflow-y-auto px-4 py-4">
            {chat.messages.filter((m) => m.role === "assistant" && m.content).length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500">No output yet. Fill in the form and click &quot;Generate Authorization&quot; to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {chat.messages
                  .filter((m) => m.role === "assistant" && m.content)
                  .map((m, i, arr) => (
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
        )}
      </div>
    </div>
  );
}
