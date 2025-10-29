export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  isEnabled?: boolean,
}

export const insuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
    isEnabled: true,
  },
  {
    value: "Carelon",
    label: "Carelon",
    isEnabled: true,
  },
  {
    value: "Evolent",
    label: "Evolent",
    isEnabled: true,
  },
];

export const defaultInsuranceProvidersOptions: SelectOption[] = [
  {
    value: "Medicare",
    label: "Medicare",
    isEnabled: true,
  },
  {
    value: "Carelon",
    label: "Carelon",
    isEnabled: false,
  },
  {
    value: "Evolent",
    label: "Evolent",
    isEnabled: false,
  },
];

const allowedEmails = [
  "miteshp@notedoctor.ai", // Example admin email
  "wramirez1980@gmail.com", // Example premium user email

];
export const getInsuranceProvidersOptions = (user: { email: string; isSignedIn: boolean }): SelectOption[] => {
  return defaultInsuranceProvidersOptions.map(option => {
    // Check if the user is signed in and their email is in the allowed list
    if (user.isSignedIn && allowedEmails.includes(user.email)) {
      // Enable Carelon and Evolent for allowed users
      if (option.value === "Carelon" || option.value === "Evolent") {
        return { ...option, isEnabled: true };
      }
    }
    return option; // Keep other options unchanged
  });
};