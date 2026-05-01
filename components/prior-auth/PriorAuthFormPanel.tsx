"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Send, LoaderCircle, FileText, MapPin, Stethoscope, FileBarChart, Activity, ClipboardList, BookOpen } from "lucide-react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/utils/cn";
import { data as stateData } from "@/app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";
import { type SelectOption } from "@/data/selectOptions";
import { usePriorAuthForm, usePriorAuthUi } from "@/components/providers/PriorAuthProvider";

const stateOptions = stateData.map((s) => ({ value: s.description, label: s.description }));

const selectStyles = {
  control: (base: any) => ({
    ...base,
    minHeight: "36px",
    fontSize: "14px",
    borderColor: "#e2e8f0",
    borderRadius: "8px",
    "&:hover": { borderColor: "#bfdbfe" },
  }),
  menu: (base: any) => ({ ...base, borderRadius: "8px", overflow: "hidden" }),
  option: (base: any, state: any) => ({
    ...base,
    color: state.isSelected ? "#fff" : "#111827",
  }),
};

interface PriorAuthFormPanelProps {
  guidelinesOptions: SelectOption[];
  isProcessing: boolean;
  isLayoutSwapped: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

export function PriorAuthFormPanel({
  guidelinesOptions,
  isProcessing,
  isLayoutSwapped,
  onGenerate,
  onCancel,
}: PriorAuthFormPanelProps) {
  const { formFields, updateFormField, openAccordions, setOpenAccordions } = usePriorAuthForm();
  const { activeFormTab } = usePriorAuthUi();

  const patientHistoryRef = useRef<HTMLDivElement>(null);
  const relevantHistoryRef = useRef<HTMLDivElement>(null);

  const handleGuidelinesChange = (value: string) => {
    updateFormField("guidelines", value);
    if (value === "Commercial") updateFormField("state", "");
  };

  return (
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

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 pt-2 space-y-5">
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
              onChange={(v) => handleGuidelinesChange(v?.value ?? "")}
              placeholder="Select..."
              classNamePrefix="react-select"
              styles={selectStyles}
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
              onChange={(v) => updateFormField("state", v?.value ?? "")}
              placeholder="Select..."
              classNamePrefix="react-select"
              styles={{
                ...selectStyles,
                control: (base: any) => ({
                  ...selectStyles.control(base),
                  opacity: formFields.guidelines === "Commercial" ? 0.5 : 1,
                  cursor: formFields.guidelines === "Commercial" ? "not-allowed" : "default",
                }),
              }}
            />
            {formFields.guidelines === "Commercial" && (
              <p className="text-xs text-gray-500 mt-1">
                State selection not required for Commercial guidelines
              </p>
            )}
          </div>
        </div>

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
              onChange={(v) => updateFormField("treatment", v?.value ?? "")}
              placeholder="Select..."
              classNamePrefix="react-select"
              styles={selectStyles}
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
              onChange={(e) => updateFormField("cptCodes", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
            <Activity size={13} color="#F97316" />
            Diagnosis
          </label>
          <Textarea
            placeholder="knee pain"
            value={formFields.diagnosis}
            className="min-h-[100px] max-h-[200px] resize-y bg-white border-blue-200 text-gray-900 focus-visible:ring-blue-300"
            onChange={(e) => updateFormField("diagnosis", e.target.value)}
          />
        </div>

        <Accordion
          type="multiple"
          className="w-full space-y-2"
          value={openAccordions}
          onValueChange={(value) => {
            setOpenAccordions(value);
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
                onChange={(e) => updateFormField("patientHistory", e.target.value)}
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
                onChange={(e) => updateFormField("relevantHistory", e.target.value)}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="px-6 pb-1 pt-4 flex-shrink-0 top-1 bg-white border-t border-gray-200">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={onGenerate}
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
            onClick={onCancel}
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
  );
}
