'use client'

export type StateData = {
  state_id: number;
  description: string;
};

export const Data: StateData[] = [
  {
    state_id: 2,
    description: "Alabama",
  },
  {
    state_id: 1,
    description: "Alaska",
  },
  {
    state_id: 4,
    description: "American Samoa",
  },
  {
    state_id: 5,
    description: "Arizona",
  },
  {
    state_id: 3,
    description: "Arkansas",
  },
  {
    state_id: 6,
    description: "California - Entire State",
  },
  {
    state_id: 66,
    description: "California - Northern",
  },
  {
    state_id: 67,
    description: "California - Southern",
  },
  {
    state_id: 8,
    description: "Colorado",
  },
  {
    state_id: 9,
    description: "Connecticut",
  },
  {
    state_id: 11,
    description: "Delaware",
  },
  {
    state_id: 10,
    description: "District of Columbia",
  },
  {
    state_id: 12,
    description: "Florida",
  },
  {
    state_id: 14,
    description: "Georgia",
  },
  {
    state_id: 15,
    description: "Guam",
  },
  {
    state_id: 16,
    description: "Hawaii",
  },
  {
    state_id: 18,
    description: "Idaho",
  },
  {
    state_id: 19,
    description: "Illinois",
  },
  {
    state_id: 20,
    description: "Indiana",
  },
  {
    state_id: 17,
    description: "Iowa",
  },
  {
    state_id: 21,
    description: "Kansas",
  },
  {
    state_id: 22,
    description: "Kentucky",
  },
  {
    state_id: 23,
    description: "Louisiana",
  },
  {
    state_id: 26,
    description: "Maine",
  },
  {
    state_id: 25,
    description: "Maryland",
  },
  {
    state_id: 24,
    description: "Massachusetts",
  },
  {
    state_id: 27,
    description: "Michigan",
  },
  {
    state_id: 28,
    description: "Minnesota",
  },
  {
    state_id: 31,
    description: "Mississippi",
  },
  {
    state_id: 29,
    description: "Missouri - Entire State",
  },
  {
    state_id: 61,
    description: "Missouri - Northeastern & Southern",
  },
  {
    state_id: 62,
    description: "Missouri - Northwestern",
  },
  {
    state_id: 32,
    description: "Montana",
  },
  {
    state_id: 36,
    description: "Nebraska",
  },
  {
    state_id: 40,
    description: "Nevada",
  },
  {
    state_id: 37,
    description: "New Hampshire",
  },
  {
    state_id: 38,
    description: "New Jersey",
  },
  {
    state_id: 39,
    description: "New Mexico",
  },
  {
    state_id: 63,
    description: "New York - Downstate",
  },
  {
    state_id: 41,
    description: "New York - Entire State",
  },
  {
    state_id: 64,
    description: "New York - Queens",
  },
  {
    state_id: 65,
    description: "New York - Upstate",
  },
  {
    state_id: 34,
    description: "North Carolina",
  },
  {
    state_id: 35,
    description: "North Dakota",
  },
  {
    state_id: 60,
    description: "Northern Mariana Islands",
  },
  {
    state_id: 42,
    description: "Ohio",
  },
  {
    state_id: 43,
    description: "Oklahoma",
  },
  {
    state_id: 44,
    description: "Oregon",
  },
  {
    state_id: 45,
    description: "Pennsylvania",
  },
  {
    state_id: 46,
    description: "Puerto Rico",
  },
  {
    state_id: 47,
    description: "Rhode Island",
  },
  {
    state_id: 48,
    description: "South Carolina",
  },
  {
    state_id: 49,
    description: "South Dakota",
  },
  {
    state_id: 50,
    description: "Tennessee",
  },
  {
    state_id: 51,
    description: "Texas",
  },
  {
    state_id: 52,
    description: "Utah",
  },
  {
    state_id: 55,
    description: "Vermont",
  },
  {
    state_id: 54,
    description: "Virgin Islands",
  },
  {
    state_id: 53,
    description: "Virginia",
  },
  {
    state_id: 56,
    description: "Washington",
  },
  {
    state_id: 58,
    description: "West Virginia",
  },
  {
    state_id: 57,
    description: "Wisconsin",
  },
  {
    state_id: 59,
    description: "Wyoming",
  },
];

export function getStateIdByDescription(
  description: string,
): number | undefined {
  const state = Data.find(
    (item) => item.description.toLowerCase() === description.toLowerCase(),
  );
  return state?.state_id;
}
