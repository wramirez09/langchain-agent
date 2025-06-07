"use client";

import { ChatWindow } from "@/components/ChatWindow";

import { Container, Select, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
export default function AgentsPage() {
  const form = useForm();
  const Form = (
    <Container size="sm">
      <form onSubmit={form.onSubmit((values) => console.log(values))}>
        <Select
          label="Select State"
          name="state"
          placeholder="Pick value"
          data={[
            "Alabama",
            "Alaska",
            "Arizona",
            "Arkansas",
            "California",
            "Colorado",
            "Connecticut",
            "Delaware",
            "District Of Columbia",
            "Florida",
            "Georgia",
            "Hawaii",
            "Idaho",
            "Illinois",
            "Indiana",
            "Iowa",
            "Kansas",
            "Kentucky",
            "Louisiana",
            "Maine",
            "Maryland",
            "Massachusetts",
            "Michigan",
            "Minnesota",
            "Mississippi",
            "Missouri",
            "Montana",
            "Nebraska",
            "Nevada",
            "New Hampshire",
            "New Jersey",
            "New Mexico",
            "New York",
            "North Carolina",
            "North Dakota",
            "Ohio",
            "Oklahoma",
            "Oregon",
            "Pennsylvania",
            "Rhode Island",
            "South Carolina",
            "South Dakota",
            "Tennessee",
            "Texas",
            "Utah",
            "Vermont",
            "Virginia",
            "Washington",
            "West Virginia",
            "Wisconsin",
            "Wyoming",
          ]}
          searchable
          clearable
          className="text-white my-6"
        />
        <Textarea
          label="Treatment or Service"
          name="treatmentOrService"
          // description="Input description"
          placeholder="Input placeholder"
          className="text-white"
        />
      </form>
    </Container>
  );

  return (
    <ChatWindow
      endpoint="api/chat/agents"
      emptyStateComponent={Form}
      placeholder="Squawk! I'm a conversational agent! Ask me about the current weather in Honolulu!"
      emoji="🦜"
      showIntermediateStepsToggle={true}
    />
  );
}
