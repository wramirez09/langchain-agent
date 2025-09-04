"use client";

import React, { ChangeEvent, ChangeEventHandler, useCallback } from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";

import AutoCompleteSelect from "../AutoCompleteSelect";
import { insruranceProvidersOptions } from "../../../data/selectOptions";
import { Textarea } from "../textarea";
import { Input } from "../input";
import { Label } from "@/components/ui/label";

type Props = {
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: ChangeEventHandler<HTMLTextAreaElement>;
};

const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const FormInputs: React.FC<Props> = (props: Props) => {
  const stateOptions = getStateOptions(Data);

  const handleInsuranceSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("Insurance", value),
    [props.onStateFormStateChange],
  );

  const handleStateSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("State", value),
    [props.onStateFormStateChange],
  );

  const HandleTreatmentSelectChange = useCallback(
    (value: string) => props.onStateFormStateChange("Treatment", value),
    [props.onStateFormStateChange],
  );

  const handleCptChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("CPT code(s)", e.target.value),
    [props.onStateFormStateChange],
  );

  const handleDiagnosisChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("Diagnosis", e.target.value),
    [props.onStateFormStateChange],
  );

  const handleHistoryChange = useCallback(
    (e: ChangeEvent<any>) =>
      props.onStateFormStateChange("History", e.target.value),
    [props.onStateFormStateChange],
  );

  return (
    <section className="w-full mt-8 mx-0 md:mx-1">
      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semi-bold text-black mb-1">
            Insurance Provider
          </label>
          <AutoCompleteSelect
            options={insruranceProvidersOptions}
            onChange={handleInsuranceSelectChange}
          />
        </div>
        <div>
          <label className="block text-sm font-semi-bold text-black mb-1">
            State
          </label>
          <AutoCompleteSelect
            options={stateOptions}
            onChange={handleStateSelectChange}
          />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semi-bold text-black mb-1">
            Treatment
          </label>
          <AutoCompleteSelect
            options={ncdOptions}
            onChange={HandleTreatmentSelectChange}
          />
        </div>
        <div>
          <label className="block text-sm font-semi-bold text-black mb-1">
            CPT Code(s)
          </label>
          <Input
            type="text"
            placeholder="CPT Codes"
            onChange={handleCptChange}
            className="border border-[#a8afba] text-[] focus-visible:ring-ring  bg-gray-300 text-gray-800 placeholder:text-xs"
          />
        </div>
      </div>

      {/* Diagnosis */}
      <div className="mb-5">
        <label className="block text-sm font-semi-bold text-black mb-1">
          Diagnosis
        </label>
        <Textarea
          placeholder="Magnetic Resonance Imaging"
          onChange={handleDiagnosisChange}
          className="border border-[#a8afba] text-[] focus-visible:ring-ring text-gray-800"
        />
      </div>

      {/* History */}
      <div className="mb-5">
        <label className="block text-sm font-semi-bold text-black mb-1">
          Patient(s) Medical History
        </label>
        <Textarea
          placeholder="Meniscus tear"
          onChange={handleHistoryChange}
          className="border border-[#a8afba] text-[] focus-visible:ring-ring text-gray-800"
        />
      </div>

      {/* Chat Context */}
      <div className="mb-5">
        <label className="block text-sm font-semi-bold text-black mb-1">
          Additional Chat Prompt Context (optional)
        </label>
        <Textarea
          placeholder="Get CPT codes"
          onChange={props.chatOnChange}
          className="border border-[#a8afba] text-[] focus-visible:ring-ring text-gray-800"
        />
      </div>
    </section>
  );
};

export default FormInputs;
