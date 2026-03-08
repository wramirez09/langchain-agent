import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agent",
  description: "Interact with the NoteDoctor.ai agent for real-time prior authorization guidance and payer policy lookup.",
  robots: { index: false, follow: false },
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
