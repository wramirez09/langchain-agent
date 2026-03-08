import type { Metadata } from "next";
import { SignUpForm } from "@/components/sign-up-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NoteDoctor.ai account and start screening prior authorization requests instantly.",
  robots: { index: false, follow: false },
};


export default function Page() {
  return (
    <>
      <SignUpForm />

    </>
  );
}
