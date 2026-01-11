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
    value: "Carelon",
    label: "Carelon",
    isdisabled: true,
  },
  {
    value: "Evolent",
    label: "Evolent",
    isdisabled: true,
  },
];

export const defaultInsuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
    isdisabled: false,
  },
  {
    value: "Carelon",
    label: "Carelon",
    isdisabled: true,
  },
  {
    value: "Evolent",
    label: "Evolent",
    isdisabled: true,
  },
];

const allowedEmails = [
  "miteshp@notedoctor.ai",
  "wramirez1980@gmail.com",

];
export const getInsuranceProvidersOptions = (user: { email: string; isSignedIn: boolean }): SelectOption[] => {
  return defaultInsuranceProvidersOptions.map(option => {
    // Check if the user is signed in and their email is in the allowed list
    if (user.isSignedIn && allowedEmails.includes(user.email)) {
      // Enable Carelon and Evolent for allowed users
      if (option.value === "Carelon" || option.value === "Evolent") {
        return { ...option, isdisabled: false };
      }
    }
    return option; // Keep other options unchanged
  });
};