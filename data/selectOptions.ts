export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  isdisabled?: boolean,
}

export const insuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
    isdisabled: false,
  },
  {
    value: "Commercial",
    label: "Commercial",
    isdisabled: false,
  },
];

export const defaultInsuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
    isdisabled: false,
  },
  {
    value: "Commercial",
    label: "Commercial",
    isdisabled: false,
  },
];

const allowedEmails = [
  "miteshp@notedoctor.ai",
  "wramirez1980@gmail.com",

];
export const getInsuranceProvidersOptions = (user: { email: string; isSignedIn: boolean }): SelectOption[] => {
  return defaultInsuranceProvidersOptions;
};