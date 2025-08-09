"use client";
import {
  __InputStylesNames,
  ComboboxItem,
  Grid,
  Select,
  Textarea,
} from "@mantine/core";

import React, { ChangeEvent, useState } from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";

import classes from "./FloatinLabelInput.module.css";
import { FileUploadForm } from "../FileUpload";
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
  const [chathistoryFocused, setHistoryFocused] = useState(false);
  const [cptFocused, setCptFocused] = useState(false);

  const [insureanceValue, setInsrunceValue] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [treatmentValue, settreatmentValue] = useState("");
  const [diagnosisValue, setDiagnosisValue] = useState("");
  const [chatValue, setChatValue] = useState("");
  const [historyValue, setHistoryValue] = useState("");
  const [cptValue, setCptValue] = useState("");

  const [formDisabledFields, setFormDisabledFields] = useState({
    insurance: false,
    state: false,
    treatment: false,
    diagnosis: false,
    chat: false,
    history: false,
    cpt: false,
  });

  const insuranceFloating =
    insureanceValue.length !== 0 || insuranceFocused || undefined;
  const stateFloating = stateValue.length !== 0 || stateFocused || undefined;
  const treatmentFloating =
    treatmentValue.length !== 0 || treatmentFocused || undefined;
  const diagnosisFloating =
    diagnosisValue.length !== 0 || diagnosisFocused || undefined;
  const chatFloating = chatValue.length !== 0 || chatFocused || undefined;
  const chatHistoryFloating =
    historyValue.length !== 0 || chathistoryFocused || undefined;
  const cptFloating = cptValue.length !== 0 || cptFocused || undefined;

  return (
    <section className="mt-8 mx-0 md:mx-8 px-2 md:px-8">
      <Grid>
        <Grid.Col span={6}>
          <Select
            label="Insurance Provider"
            name="insurance"
            placeholder="Medicare or private insurance"
            data={[
              { value: "Medicare", label: "Medicare" },
              { value: "Carelon", label: "Carelon" },
              { value: "Evolent", label: "Evolent" },
            ]}
            searchable
            clearable
            classNames={classes}
            className="text-white mb-3 mb-7"
            onChange={(value) => {
              if (value !== null) {
                setInsrunceValue(value);
                props.onStateFormStateChange("Insurance", value as string);
              }
              if (value === "Evolent" || value === "Carelon") {
                setFormDisabledFields((prevState) => {
                  return {
                    ...prevState,
                    state: true,
                  };
                });
              } else {
                setFormDisabledFields((prevState) => {
                  return {
                    ...prevState,
                    state: false,
                  };
                });
              }
              if (value === "Medicare") {
                setFormDisabledFields((prevState) => {
                  return {
                    ...prevState,
                    cpt: true,
                  };
                });
              } else {
                setFormDisabledFields((prevState) => {
                  return {
                    ...prevState,
                    cpt: false,
                  };
                });
              }
            }}
            onFocus={() => setInsuranceFocused(true)}
            onBlur={() => setInsuranceFocused(false)}
            data-floating={insuranceFloating}
            labelProps={{ "data-floating": insuranceFloating }}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Select
            label="State"
            name="state"
            placeholder="IL"
            data={options}
            searchable
            clearable
            classNames={classes}
            className="text-white mb-3 mb-7"
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
            disabled={formDisabledFields.state}
          />
        </Grid.Col>

        <Grid.Col span={6}>
          <Select
            label="Treatment"
            name="treatment"
            placeholder="Magnetic Resonance Imaging (MRI)"
            data={ncdOptions}
            searchable
            clearable
            classNames={classes}
            className="text-white mb-3 mb-7"
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
        </Grid.Col>
        <Grid.Col span={6}>
          <Textarea
            label="CPT Code(s)"
            name="CPT code(s)"
            placeholder="CPT code(s)"
            className="text-white mb-3 mb-7"
            onChange={(event) => {
              setCptValue(event.target.value);
              props.onStateFormStateChange("CPT code(s)", event.target.value);
            }}
            classNames={classes}
            onFocus={() => setCptFocused(true)}
            onBlur={() => setCptFocused(false)}
            data-floating={cptFloating}
            labelProps={{ "data-floating": cptFloating }}
            rows={1}
            disabled={formDisabledFields.cpt}
          />
        </Grid.Col>

        <Grid.Col>
          <Textarea
            label="Diagnosis"
            name="diagnosis"
            placeholder="diagnosis"
            className="text-white mb-3 mb-7"
            onChange={(event) => {
              setDiagnosisValue(event.target.value);
              props.onStateFormStateChange("Diagnosis", event.target.value);
            }}
            classNames={classes}
            onFocus={() => setDiagnosisFocused(true)}
            onBlur={() => setDiagnosisFocused(false)}
            data-floating={diagnosisFloating}
            labelProps={{ "data-floating": diagnosisFloating }}
            resize="vertical"
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea
            label="Patient(s) Medical History"
            name="medicalHistory"
            placeholder="Patient(s) Medical History"
            className="text-white mb-3 mb-0"
            onChange={(event) => {
              setHistoryValue(event.target.value);
              props.onStateFormStateChange("History", event.target.value);
            }}
            classNames={classes}
            onFocus={() => setHistoryFocused(true)}
            onBlur={() => setHistoryFocused(false)}
            data-floating={chatHistoryFloating}
            labelProps={{ "data-floating": chatHistoryFloating }}
            resize="vertical"
          />
        </Grid.Col>

        <Grid.Col span={12}>
          <Textarea
            rows={2}
            label="Chat Prompt"
            name="Chat Prompt"
            placeholder="Get NCD information about the selected treatment or service."
            className="text-white mb-0 md:mb-0 md:pb-2"
            onChange={(event) => {
              setChatValue(event.target.value);
              props.chatOnChange(
                event as unknown as ChangeEvent<HTMLInputElement>,
              );
            }}
            classNames={classes}
            onFocus={() => setChatFocused(true)}
            onBlur={() => setChatFocused(false)}
            data-floating={chatFloating}
            labelProps={{ "data-floating": chatFloating }}
          />
        </Grid.Col>
      </Grid>
    </section>
  );
};

export default FormInputs;
