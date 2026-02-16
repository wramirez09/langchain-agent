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
      backgroundColor: "white",
      borderColor: state.isFocused ? "#3b82f6" : "#dbeafe",
      borderWidth: "1px",
      borderStyle: "solid",
      borderRadius: "0.375rem",
      fontSize: "1rem",
      color: "#111827",
      boxShadow: state.isFocused ? "0 0 0 2px #3b82f6, 0 0 0 1px #fff" : "none",
      "&:hover": {
        borderColor: "#93c5fd",
        backgroundColor: "#eff6ff",
      },
      cursor: isDisabled ? "not-allowed" : "text",
      opacity: isDisabled ? 0.5 : 1,
    }),
    placeholder: (base) => ({
      ...base,
      color: "#6b7280",
    }),
    input: (base) => ({
      ...base,
      color: "#111827",
      margin: "0px",
    }),
    singleValue: (base) => ({
      ...base,
      color: "#111827",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "white",
      border: "1px solid #e5e7eb",
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
      backgroundColor: state.isFocused ? "#f3f4f6" : "white",
      color: "#111827",
      cursor: "pointer",
      padding: "0.75rem 1rem",
      fontSize: "1rem",
      "&:hover": {
        backgroundColor: "#f3f4f6",
      },
      "&:active": {
        backgroundColor: "#e5e7eb",
      },
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: "#6b7280",
      transition: "transform 200ms ease",
      transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : "rotate(0deg)",
    }),
    clearIndicator: (base) => ({
      ...base,
      color: "#6b7280",
      cursor: "pointer",
      "&:hover": {
        color: "#374151",
      },
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: "#e5e7eb",
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
