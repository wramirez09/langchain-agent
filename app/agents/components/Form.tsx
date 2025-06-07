"use client";
import { Title, Select, Textarea, Container } from "@mantine/core";

import React from "react";
import { Data, StateData } from "../metaData/states";

type Props = {
  onChange: any;
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
      <Title order={1} className="text-white my-6">
        Medicare Pre Authorization Assitance
      </Title>

      <Select
        label="Select State"
        name="state"
        placeholder="Pick value"
        data={options}
        searchable
        clearable
        className="text-white my-6"
        onChange={props.onChange}
      />
      <Textarea
        label="Treatment or Service"
        name="treatmentOrService"
        // description="Input description"
        placeholder="Input placeholder"
        className="text-white"
        onChange={props.onChange}
      />
    </Container>
  );
};

export default FormInputs;
