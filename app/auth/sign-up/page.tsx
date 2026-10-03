import type { Metadata } from "next";
import { SignUpForm } from "@/components/sign-up-form";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NoteDoctorAiaccount and start screening prior authorization requests instantly.",
  robots: { index: false, follow: false },
};


export default function Page() {
  return (
    <div className="h-full flex items-center justify-center bg-gradient-light dark:bg-none p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Create your account</h1>
          <p className="text-dark dark:text-muted-foreground">Sign up to get started with NoteDoctorAi</p>
        </div>
        <div className="bg-card rounded-xl shadow-md p-8 dark:border dark:border-border dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
          <SignUpForm />
        </div>
      </div>
    </div>
  );
}
