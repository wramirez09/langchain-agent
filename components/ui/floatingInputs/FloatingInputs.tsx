"use client";

import {
  __InputStylesNames,
  SelectProps,
  TextareaProps,
  TextInputProps,
} from "@mantine/core";
import { useState } from "react";
import classes from "./FloatinLabelInput.module.css";
import { isUndefined } from "lodash";
import { Data } from "@/app/agents/metaData/states";

type baseInputProps = TextInputProps | SelectProps | TextareaProps;

type PickedFloatingLabelProps<T> = Extract<T, baseInputProps> & {
  render: () => React.ReactNode;
};

export function FloatinglInputBase<T>(
  props: React.PropsWithChildren<PickedFloatingLabelProps<T>>,
) {
  return <>{props.render()}</>;
}
