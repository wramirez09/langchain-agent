"use client";
import {
  __InputStylesNames,
  Select,
  SelectProps,
  Textarea,
} from "@mantine/core";

import React from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";
import { ncdOptions } from "@/data/ncdOptions";
import { FloatinglInputBase } from "../floatingInputs/FloatingInputs";

type Props = { onStateFormStateChange: (key: string, value: string) => void };
const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const FormInputs: React.FC<Props> = (props: Props) => {
  const options = getStateOptions(Data);

  return (
    <section className="mt-8 mx-8 px-8">
      <h3 className="text-[#7f8b9d] mb-6">
        make selections below to get started and click the "Send" button to
        information about the selected treatment or service.
      </h3>

      <FloatinglInputBase<SelectProps>
        component={Select}
        label="Insurance Provider"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="Insurance"
        placeholder="medicare or private insurance"
        data={[
          { value: "medicare", label: "Medicare" },
          { value: "cigna", label: "Cigna" },
          { value: "Any", label: "any" },
        ]}
        searchable
        clearable
        className="text-white mb-7 pb-6"
        onChange={(value) => {
          if (value !== null) {
            props.onStateFormStateChange("Insurance", value as string);
          }
        }}
        defaultValue={"Any"}
        disabled
      />

      <FloatinglInputBase<SelectProps>
        component={Select}
        label="State"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="state"
        placeholder="IL"
        data={options}
        searchable
        clearable
        className="text-white mb-7 pb-6"
        onChange={(option: any) => {
          if (option !== null) {
            props.onStateFormStateChange("State", option.label);
          }
        }}
      />

      <FloatinglInputBase<SelectProps>
        component={Select}
        label="Treatment / Service"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="treatment"
        placeholder="Magnetic Resonance Imaging (MRI)"
        data={ncdOptions}
        searchable
        clearable
        className="text-white mb-7 pb-6"
        onChange={(option: any) => {
          if (option !== null) {
            props.onStateFormStateChange("Treatment", option.label);
          }
        }}
      />
      <FloatinglInputBase
        label="Diagnosis"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="diagnosis"
        placeholder="Meniscus Tear"
        className="text-white mb-7 pb-6"
        onChange={(event) =>
          props.onStateFormStateChange("Diagnosis", event.target.value)
        }
        component={Textarea}
      />
    </section>
  );
};

export default FormInputs;
