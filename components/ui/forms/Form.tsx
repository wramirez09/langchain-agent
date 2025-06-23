"use client";
import { Select, Textarea } from "@mantine/core";

import React from "react";
import { Data, StateData } from "../../../app/agents/metaData/states";

type Props = {
  onStateFormStateChange: (key: string, value: string) => void;
};
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
      <Select
        label="Insurance Provider"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="Insurance"
        placeholder="medicare or private insurance"
        data={[
          { value: "medicare", label: "Medicare" },
          { value: "cigna", label: "Cigna" },
        ]}
        searchable
        clearable
        className="text-white mb-6"
        onChange={(value) => {
          if (value !== null) {
            props.onStateFormStateChange("insurance", value);
          }
        }}
      />
      <Select
        label="Select State"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="state"
        placeholder="IL"
        data={options}
        searchable
        clearable
        className="text-white mb-6"
        onChange={(value) => {
          if (value !== null) {
            props.onStateFormStateChange("State", value);
          }
        }}
      />
      <Textarea
        label="Treatment or Service"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="treatment"
        placeholder="Magnetic Resonance Imaging (MRI)"
        className="text-white mb-6"
        onChange={(event) =>
          props.onStateFormStateChange("Treatment", event.target.value)
        }
      />
      <Textarea
        label="Diagnosis"
        labelProps={{ className: "text-[#7f8b9d]" }}
        name="diagnosis"
        placeholder="Meniscus Tear"
        className="text-white mb-6"
        onChange={(event) =>
          props.onStateFormStateChange("Diagnosis", event.target.value)
        }
      />
    </section>
  );
};

export default FormInputs;
