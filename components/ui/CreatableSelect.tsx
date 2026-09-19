"use client";

import * as React from "react";
import CreatableSelect from "react-select/creatable";
import { SelectOption } from "@/data/selectOptions";
import { StylesConfig } from "react-select";
import { useMediaQuery } from "@/utils/use-media-query";

interface CreatableSelectComponentProps {
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

interface OptionType {
  value: string;
  label: string;
}

const CreatableSelectComponent: React.FC<CreatableSelectComponentProps> = ({
  options,
  onChange,
  placeholder = "Select an option",
  isDisabled = false,
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  
  // Convert SelectOption to react-select format
  const selectOptions: OptionType[] = options.map(option => ({
    value: option.value,
    label: option.label,
  }));

  const handleChange = (selectedOption: OptionType | null) => {
    if (selectedOption) {
      onChange(selectedOption.value);
    }
  };

  // Custom styles to match current design
  const customStyles: StylesConfig<OptionType, false> = {
    control: (base, state) => ({
      ...base,
      width: "100%",
      height: "40px",
      minHeight: "40px",
      backgroundColor: "hsl(var(--card))",
      borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--primary) / 0.25)",
      borderWidth: "1px",
      borderStyle: "solid",
      borderRadius: "0.375rem",
      fontSize: "1rem",
      color: "hsl(var(--foreground))",
      boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring)), 0 0 0 1px hsl(var(--card))" : "none",
      "&:hover": {
        borderColor: "hsl(var(--primary) / 0.5)",
        backgroundColor: "hsl(var(--primary) / 0.05)",
      },
      cursor: isDisabled ? "not-allowed" : "text",
      opacity: isDisabled ? 0.5 : 1,
    }),
    placeholder: (base) => ({
      ...base,
      color: "hsl(var(--muted-foreground))",
    }),
    input: (base) => ({
      ...base,
      color: "hsl(var(--foreground))",
      margin: "0px",
    }),
    singleValue: (base) => ({
      ...base,
      color: "hsl(var(--foreground))",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "0.5rem",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      zIndex: 50,
    }),
    menuList: (base) => ({
      ...base,
      padding: "0.25rem",
      borderRadius: "0.5rem",
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "hsl(var(--muted))" : "hsl(var(--card))",
      color: "hsl(var(--foreground))",
      cursor: "pointer",
      padding: "0.75rem 1rem",
      fontSize: "1rem",
      "&:hover": {
        backgroundColor: "hsl(var(--muted))",
      },
      "&:active": {
        backgroundColor: "hsl(var(--border))",
      },
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: "hsl(var(--muted-foreground))",
      transition: "transform 200ms ease",
      transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : "rotate(0deg)",
    }),
    clearIndicator: (base) => ({
      ...base,
      color: "hsl(var(--muted-foreground))",
      cursor: "pointer",
      "&:hover": {
        color: "hsl(var(--foreground-soft))",
      },
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: "hsl(var(--border))",
    }),
  };

  return (
    <div className="w-full">
      <CreatableSelect
        isClearable
        isDisabled={isDisabled}
        options={selectOptions}
        styles={customStyles}
        placeholder={placeholder}
        onChange={handleChange}
        className={`w-full ${!isDesktop ? 'mobile-select-touch' : ''}`}
        classNamePrefix="react-select"
        menuPortalTarget={document.body}
        menuShouldBlockScroll={true}
        isSearchable={isDesktop}
        openMenuOnFocus={isDesktop}
        openMenuOnClick={true}
        tabSelectsValue={false}
      />
    </div>
  );
};

export default CreatableSelectComponent;
