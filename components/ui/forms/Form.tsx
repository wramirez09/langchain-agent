"use client";

import React, {
  ChangeEvent,
  ChangeEventHandler,
  useCallback,
  useState,
} from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";

import classes from "./FloatinLabelInput.module.css";

import AutoCompleteSelect from "../AutoCompleteSelect";
import { insruranceProvidersOptions } from "../../../data/selectOptions";
import { Textarea } from "../textarea";

import { Input } from "../input";

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
    (value: string) => {
      props.onStateFormStateChange("Insurance", value);
    },
    [props.onStateFormStateChange],
  );

  const handleStateSelectChange = useCallback(
    (value: string) => {
      props.onStateFormStateChange("State", value);
    },
    [props.onStateFormStateChange],
  );

  const HandleTreatmentSelectChange = useCallback(
    (value: string) => {
      props.onStateFormStateChange("Treatment", value);
    },
    [props.onStateFormStateChange],
  );

  const handleCptChange = useCallback(
    (e: ChangeEvent<any>) => {
      props.onStateFormStateChange("CPT code(s)", e.target.value);
    },
    [props.onStateFormStateChange],
  );

  const handleDiagnosisChange = useCallback(
    (e: ChangeEvent<any>) => {
      props.onStateFormStateChange("Diagnosis", e.target.value);
    },
    [props.onStateFormStateChange],
  );

  const handleHistoryChange = useCallback(
    (e: ChangeEvent<any>) => {
      props.onStateFormStateChange("History", e.target.value);
    },
    [props.onStateFormStateChange],
  );

  return (
    <section className="w-full mt-8 mx-0 md:mx-1">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className={(classes.label, "text-zinc-200")}>
            Insurance Provider
          </label>
          <AutoCompleteSelect
            options={insruranceProvidersOptions}
            onChange={(value) => handleInsuranceSelectChange(value)}
          />
        </div>
        <div>
          <label className={(classes.label, "text-zinc-200")}>State</label>
          <AutoCompleteSelect
            options={stateOptions}
            onChange={handleStateSelectChange}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className={(classes.label, "text-zinc-200")}>Treatment</label>
          <AutoCompleteSelect
            options={ncdOptions}
            onChange={HandleTreatmentSelectChange}
          />
        </div>
        <div className="mb-5">
          <label className={(classes.label, "text-zinc-200")}>
            CPT Code(s)
          </label>
          <Input
            type="text"
            placeholder="CPT Codes"
            onChange={handleCptChange}
          />
        </div>
      </div>
      <div className="mb-5">
        <label className={(classes.label, "text-zinc-200")}>Diagnosis</label>
        <Textarea
          placeholder="Magnetic Resonance Imaging"
          onChange={handleDiagnosisChange}
        />
      </div>
      <div className="mb-5">
        <label className={(classes.label, "text-zinc-200")}>
          Patient(s) Medical History
        </label>
        <Textarea placeholder="Meniscus tear" onChange={handleHistoryChange} />
      </div>
      <div className="mb-5">
        <label className={(classes.label, "text-zinc-200")}>
          Additional Chat Prompt Context (optional)
        </label>
        <Textarea placeholder="Get CPT codes" onChange={props.chatOnChange} />
      </div>
    </section>
  );
};

export default FormInputs;
