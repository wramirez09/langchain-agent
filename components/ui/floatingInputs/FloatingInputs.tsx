"use client";

import { useState } from "react";
import classes from "./FloatinLabelInput.module.css";
import { isUndefined } from "lodash";
import { Data } from "@/app/agents/metaData/states";

type PickedFloatingLabelProps<T> = {
  render: () => React.ReactNode;
};

export function FloatinglInputBase<T>(
  props: React.PropsWithChildren<PickedFloatingLabelProps<T>>,
) {
  return <>{props.render()}</>;
}
