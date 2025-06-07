"use client";
import { Title, Select, Textarea, Container } from "@mantine/core";
import { useForm } from "@mantine/form";

import React from "react";
import { Data, StateData } from "../metaData/states";

type Props = {};

const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

const Form: React.FC<Props> = (props: Props) => {
  const form = useForm();
  const options = getStateOptions(Data);
  console.log("State Options:", options);
  return (
    <Container size="sm">
      <Title order={1} className="text-white mb-4">
        Medicare Pre Authorization Assitance
      </Title>
      <form onSubmit={form.onSubmit((values) => console.log(values))}>
        <Select
          label="Select State"
          name="state"
          placeholder="Pick value"
          data={options}
          searchable
          clearable
          className="text-white my-6"
        />
        <Textarea
          label="Treatment or Service"
          name="treatmentOrService"
          // description="Input description"
          placeholder="Input placeholder"
          className="text-white"
        />
      </form>
    </Container>
  );
};

export default Form;
