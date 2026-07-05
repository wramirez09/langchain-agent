import type { Metadata } from "next";
import { SignUpForm } from "@/components/sign-up-form";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NoteDoctorAiaccount and start screening prior authorization requests instantly.",
  robots: { index: false, follow: false },
};


export default function Page() {
  return (
    <div className="h-full flex items-center justify-center bg-gradient-light p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Create your account</h1>
          <p className="text-dark">Sign up to get started with NoteDoctorAi</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <SignUpForm />
        </div>
      </div>
    </div>
  );
}
