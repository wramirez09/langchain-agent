export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const insuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
  },
  {
    value: "Carelon",
    label: "Carelon",
  },
  {
    value: "Evolent",
    label: "Evolent",
  },
];
