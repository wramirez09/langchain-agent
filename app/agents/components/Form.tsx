"use client";
import {
  Title,
  Select,
  Textarea,
  Container,
  ComboboxItem,
} from "@mantine/core";

import React from "react";
import { Data, StateData } from "../metaData/states";

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
    <Container size="sm">
      <Title order={1} className="text-white my-7 py-6">
        Medicare Pre Authorization Assitance
      </Title>

      <Select
        label="Select State"
        name="state"
        placeholder="Pick value"
        data={options}
        searchable
        clearable
        className="text-white mb-6"
        onChange={(value) => {
          if (value !== null) {
            props.onStateFormStateChange("state", value);
          }
        }}
      />
      <Textarea
        label="Treatment or Service"
        name="treatment"
        placeholder="Input placeholder"
        className="text-white mb-6"
        onChange={(event) =>
          props.onStateFormStateChange("treatment", event.target.value)
        }
      />
      <Textarea
        label="Diagnosis"
        name="diagnosis"
        placeholder="Input placeholder"
        className="text-white mb-6"
        onChange={(event) =>
          props.onStateFormStateChange("diagnosis", event.target.value)
        }
      />
    </Container>
  );
};

export default FormInputs;
