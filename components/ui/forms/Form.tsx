"use client";
import {
  __InputStylesNames,
  ComboboxItem,
  Select,
  Textarea,
} from "@mantine/core";

import React, { ChangeEvent, useState } from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";

import { isUndefined, set } from "lodash";
import classes from "./FloatinLabelInput.module.css";
type Props = {
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};
const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const FormInputs: React.FC<Props> = (props: Props) => {
  const options = getStateOptions(Data);

  const [insuranceFocused, setInsuranceFocused] = useState(false);
  const [stateFocused, setStateFocused] = useState(false);
  const [treatmentFocused, setTreatmentFocused] = useState(false);
  const [diagnosisFocused, setDiagnosisFocused] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);

  const [insureanceValue, setInsrunceValue] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [treatmentValue, settreatmentValue] = useState("");
  const [diagnosisValue, setDiagnosisValue] = useState("");
  const [chatValue, setChatValue] = useState("");

  const insuranceFloating =
    insureanceValue.length !== 0 || insuranceFocused || undefined;
  const stateFloating = stateValue.length !== 0 || stateFocused || undefined;
  const treatmentFloating =
    treatmentValue.length !== 0 || treatmentFocused || undefined;
  const diagnosisFloating =
    diagnosisValue.length !== 0 || diagnosisFocused || undefined;
  const chatFloating = chatValue.length !== 0 || chatFocused || undefined;

  return (
    <section className="mt-8 mx-0 md:mx-8 px-2 md:px-8">
      <h3 className="text-[#7f8b9d] mb-9 hidden md:block">
        Make selections or add a chat prompt to get started and click the "Send"
        button to information about the selected treatment or service.
      </h3>
      <div className="hidden md:block">
        <Select
          label="Insurance Provider"
          name="insurance"
          placeholder="Medicare or private insurance"
          data={[
            { value: "medicare", label: "Medicare" },
            { value: "cigna", label: "Cigna" },
            { value: "Any", label: "any" },
          ]}
          searchable
          clearable
          classNames={classes}
          className="text-white mb-3 pb-6"
          onChange={(value) => {
            if (value !== null) {
              setInsrunceValue(value);
              props.onStateFormStateChange("Insurance", value as string);
            }
          }}
          onFocus={() => setInsuranceFocused(true)}
          onBlur={() => setInsuranceFocused(false)}
          data-floating={insuranceFloating}
          labelProps={{ "data-floating": insuranceFloating }}
          disabled
        />

        <Select
          label="State"
          name="state"
          placeholder="IL"
          data={options}
          searchable
          clearable
          classNames={classes}
          className="text-white mb-3 pb-6"
          onChange={(value: string | null, option: ComboboxItem) => {
            if (value !== null) {
              setStateValue(value);
              props.onStateFormStateChange("State", value);
            }
          }}
          onFocus={() => setStateFocused(true)}
          onBlur={() => setStateFocused(false)}
          data-floating={stateFloating}
          labelProps={{ "data-floating": stateFloating }}
        />
        <Select
          label="Treatment"
          name="treatment"
          placeholder="Magnetic Resonance Imaging (MRI)"
          data={ncdOptions}
          searchable
          clearable
          classNames={classes}
          className="text-white mb-3 pb-6"
          onChange={(value, option) => {
            if (option !== null) {
              settreatmentValue(option.label);
              props.onStateFormStateChange("Treatment", option.label);
            }
          }}
          onFocus={() => setTreatmentFocused(true)}
          onBlur={() => setTreatmentFocused(false)}
          data-floating={treatmentFloating}
          labelProps={{ "data-floating": treatmentFloating }}
        />
        <Textarea
          label="Diagnosis"
          name="diagnosis"
          placeholder="diagnosis"
          className="text-white mb-3 pb-6"
          onChange={(event) => {
            setDiagnosisValue(event.target.value);
            props.onStateFormStateChange("Diagnosis", event.target.value);
          }}
          classNames={classes}
          onFocus={() => setDiagnosisFocused(true)}
          onBlur={() => setDiagnosisFocused(false)}
          data-floating={diagnosisFloating}
          labelProps={{ "data-floating": diagnosisFloating }}
        />
      </div>
      <Textarea
        rows={5}
        label="Chat Prompt"
        name="Chat Prompt"
        placeholder="Get NCD information about the selected treatment or service."
        className="text-white mb-0 md:mb-3 md:pb-6"
        onChange={(event) => {
          setChatValue(event.target.value);
          props.chatOnChange(event as unknown as ChangeEvent<HTMLInputElement>);
        }}
        classNames={classes}
        onFocus={() => setChatFocused(true)}
        onBlur={() => setChatFocused(false)}
        data-floating={chatFloating}
        labelProps={{ "data-floating": chatFloating }}
      />
    </section>
  );
};

export default FormInputs;
