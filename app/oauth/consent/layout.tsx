import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connect NoteDoctorAi",
  description: "Allow an AI assistant to use NoteDoctorAi on your account.",
  robots: { index: false, follow: false },
};

export default function ConsentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
