"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { type Message } from "ai";

interface FormFields {
  guidelines: string;
  state: string;
  treatment: string;
  cptCodes: string;
  diagnosis: string;
  patientHistory: string;
  relevantHistory: string;
}

interface PriorAuthContextState {
  // Form field values
  formFields: FormFields;
  
  // Form UI state
  openAccordions: string[];
  
  // Chat data
  chatMessages: Message[];
  chatInput: string;
  isLoading: boolean;
  intermediateStepsLoading: boolean;
  sourcesForMessages: Record<string, any>;
  
  // Active tab state
  activeFormTab: "pre-auth" | "chat" | "input" | "output";
  
  // Methods
  updateFormField: (field: keyof FormFields, value: string) => void;
  setOpenAccordions: (value: string[]) => void;
  resetForm: () => void;
  setChatMessages: (messages: Message[]) => void;
  setChatInput: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setIntermediateStepsLoading: (value: boolean) => void;
  setSourcesForMessages: (sources: Record<string, any>) => void;
  setActiveFormTab: (tab: "pre-auth" | "chat" | "input" | "output") => void;
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

const PriorAuthContext = createContext<PriorAuthContextState | undefined>(undefined);

export function PriorAuthProvider({ children }: { children: ReactNode }) {
  const [formFields, setFormFields] = useState<FormFields>(defaultFormFields);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const [chatMessages, _setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [intermediateStepsLoading, setIntermediateStepsLoading] = useState(false);
  const [sourcesForMessages, setSourcesForMessages] = useState<Record<string, any>>({});
  const [activeFormTab, setActiveFormTab] = useState<"pre-auth" | "chat" | "input" | "output">("pre-auth");

  const setChatMessages = (messages: Message[]) => {
    _setChatMessages(messages);
  };

  const updateFormField = (field: keyof FormFields, value: string) => {
    setFormFields((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormFields(defaultFormFields);
    setOpenAccordions([]);
    setChatInput("");
  };

  const value: PriorAuthContextState = {
    formFields,
    openAccordions,
    chatMessages,
    chatInput,
    isLoading,
    intermediateStepsLoading,
    sourcesForMessages,
    activeFormTab,
    updateFormField,
    setOpenAccordions,
    resetForm,
    setChatMessages,
    setChatInput,
    setIsLoading,
    setIntermediateStepsLoading,
    setSourcesForMessages,
    setActiveFormTab,
  };

  return (
    <PriorAuthContext.Provider value={value}>
      {children}
    </PriorAuthContext.Provider>
  );
}

export function usePriorAuthContext() {
  const context = useContext(PriorAuthContext);
  if (context === undefined) {
    throw new Error("usePriorAuthContext must be used within a PriorAuthProvider");
  }
  return context;
}
