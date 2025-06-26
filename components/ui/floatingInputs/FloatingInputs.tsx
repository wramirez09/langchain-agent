import { __InputStylesNames, SelectProps, TextInputProps } from "@mantine/core";
import { ReactNode, useState } from "react";
import classes from "./FloatinLabelInput.module.css";
import { Data } from "../../../app/agents/metaData/states";

type BaseInputProps = TextInputProps & {
  label: ReactNode;
  placeholder: string;
  required?: boolean;
  classNames?: Record<__InputStylesNames, string>;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  mt?: string;
  labelProps?: Record<string, any>;
  component: React.ElementType;
  data?: any[];
};

export function FloatinglInputBase<T>(props: T & BaseInputProps) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const floating = value.trim().length !== 0 || focused || undefined;

  const handleOnChage = (args: any) => {
    setValue(args);
    if (props.onChange) {
      props.onChange(args);
    }
  };

  return (
    <props.component
      data={props.data}
      label={props.label}
      placeholder={props.placeholder}
      required={props.required}
      classNames={{ ...classes, ...props.classNames }}
      value={value}
      onChange={(args: any) => handleOnChage(args.currentTarget.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      mt="xl"
      autoComplete="nope"
      data-floating={floating}
      labelProps={{ ...props.labelProps, "data-floating": floating }}
    />
  );
}
