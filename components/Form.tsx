"use client";
import {
  Title,
  Select,
  Textarea,
  Container,
  Button,
  ComboboxItem,
} from "@mantine/core";

import React, { FormEvent, MouseEventHandler } from "react";
import { Data, StateData } from "./metaData/states";

type Props = {
  onSelectionChange:
    | ((value: string | null, option: ComboboxItem) => void)
    | undefined;
  onTextInputChage: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
};
const getStateOptions = (data: StateData[]) => {
  return data.map((state) => ({
    value: state.description,
    label: state.description,
  }));
};

export const FormInputs: React.FC<Props> = ({
  onTextInputChage,
  onSelectionChange,
}) => {
  const options = getStateOptions(Data);

  return (
    <Container size="sm" className="w-full">
      <Select
        label="Select State"
        name="state"
        data={options}
        searchable
        clearable
        className="text-white my-6"
        onChange={onSelectionChange}
      />
      <Textarea
        label="Treatment or Service"
        name="treatmentOrService"
        // description="Input description"
        placeholder="Treatment or Service"
        className="text-white my-6"
        onChange={onTextInputChage}
      />

      <Textarea
        label="Diagnosis"
        name="diagnosis"
        // description="Input description"
        placeholder="Diagnosis"
        className="text-white"
        onChange={onTextInputChage}
      />
    </Container>
  );
};
