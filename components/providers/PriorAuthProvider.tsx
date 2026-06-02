"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { type Message } from "ai";

// ─── Form ──────────────────────────────────────────────────────────────────

interface FormFields {
  guidelines: string;
  state: string;
  treatment: string;
  cptCodes: string;
  diagnosis: string;
  patientHistory: string;
  relevantHistory: string;
}

interface FormContextState {
  formFields: FormFields;
  openAccordions: string[];
  updateFormField: (field: keyof FormFields, value: string) => void;
  setOpenAccordions: (value: string[]) => void;
  resetForm: () => void;
}

const defaultFormFields: FormFields = {
  guidelines: "",
  state: "",
  treatment: "",
  cptCodes: "",
  diagnosis: "",
  patientHistory: "",
  relevantHistory: "",
};

const FormContext = createContext<FormContextState | undefined>(undefined);

function FormProvider({ children }: { children: ReactNode }) {
  const [formFields, setFormFields] = useState<FormFields>(defaultFormFields);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  const updateFormField = (field: keyof FormFields, value: string) => {
    setFormFields((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormFields(defaultFormFields);
    setOpenAccordions([]);
  };

  return (
    <FormContext.Provider
      value={{ formFields, openAccordions, updateFormField, setOpenAccordions, resetForm }}
    >
      {children}
    </FormContext.Provider>
  );
}

export function usePriorAuthForm() {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("usePriorAuthForm must be used within a PriorAuthProvider");
  return ctx;
}

// ─── Chat ──────────────────────────────────────────────────────────────────

interface ChatContextState {
  chatMessages: Message[];
  chatInput: string;
  isLoading: boolean;
  chatIsLoading: boolean;
  intermediateStepsLoading: boolean;
  sourcesForMessages: Record<string, any>;
  // True only after a backend stream has fully completed (onFinish) for the
  // most recent query. Resets on new query, stop, clear, and page refresh
  // (in-memory state). Drives the export-button enable gate so the button
  // is enabled exactly once "all messages from the BE are in."
  responseReady: boolean;
  // Whether the most recent query originated from the form ("Generate") or the
  // raw chat input. Stamped at submit time and read when saving a query so the
  // saved record knows how to re-apply (restore form fields vs. just chat).
  lastQueryOrigin: "form" | "chat" | null;
  setChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChatInput: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setChatIsLoading: (value: boolean) => void;
  setIntermediateStepsLoading: (value: boolean) => void;
  setSourcesForMessages: (sources: Record<string, any>) => void;
  setResponseReady: (value: boolean) => void;
  setLastQueryOrigin: (origin: "form" | "chat" | null) => void;
}

const ChatContext = createContext<ChatContextState | undefined>(undefined);

function ChatProvider({ children }: { children: ReactNode }) {
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatIsLoading, setChatIsLoading] = useState(false);
  const [intermediateStepsLoading, setIntermediateStepsLoading] = useState(false);
  const [sourcesForMessages, setSourcesForMessages] = useState<Record<string, any>>({});
  const [responseReady, setResponseReady] = useState(false);
  const [lastQueryOrigin, setLastQueryOrigin] = useState<"form" | "chat" | null>(null);

  return (
    <ChatContext.Provider
      value={{
        chatMessages,
        chatInput,
        isLoading,
        chatIsLoading,
        intermediateStepsLoading,
        sourcesForMessages,
        responseReady,
        lastQueryOrigin,
        setChatMessages,
        setChatInput,
        setIsLoading,
        setChatIsLoading,
        setIntermediateStepsLoading,
        setSourcesForMessages,
        setResponseReady,
        setLastQueryOrigin,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function usePriorAuthChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("usePriorAuthChat must be used within a PriorAuthProvider");
  return ctx;
}

// ─── UI ────────────────────────────────────────────────────────────────────

type FormTab = "pre-auth" | "chat" | "input" | "output";

interface UiContextState {
  activeFormTab: FormTab;
  setActiveFormTab: (tab: FormTab) => void;
}

const UiContext = createContext<UiContextState | undefined>(undefined);

function UiProvider({ children }: { children: ReactNode }) {
  const [activeFormTab, setActiveFormTab] = useState<FormTab>("pre-auth");
  return (
    <UiContext.Provider value={{ activeFormTab, setActiveFormTab }}>
      {children}
    </UiContext.Provider>
  );
}

export function usePriorAuthUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("usePriorAuthUi must be used within a PriorAuthProvider");
  return ctx;
}

// ─── Composite ─────────────────────────────────────────────────────────────

export function PriorAuthProvider({ children }: { children: ReactNode }) {
  return (
    <FormProvider>
      <ChatProvider>
        <UiProvider>{children}</UiProvider>
      </ChatProvider>
    </FormProvider>
  );
}

/**
 * Composite hook for callers that still want the unified surface. New code
 * should prefer the granular hooks (usePriorAuthForm / usePriorAuthChat /
 * usePriorAuthUi) so components only re-render on the slice they read.
 */
export function usePriorAuthContext() {
  const form = usePriorAuthForm();
  const chat = usePriorAuthChat();
  const ui = usePriorAuthUi();

  const resetForm = () => {
    form.resetForm();
    chat.setChatInput("");
  };

  return { ...form, ...chat, ...ui, resetForm };
}
