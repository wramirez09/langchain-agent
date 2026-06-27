import type { Metadata } from "next";
import { ForgotPasswordForm } from '@/components/forgot-password-form'

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Reset your NoteDoctorAiaccount password.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="h-full flex items-center justify-center bg-gradient-light p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Reset your password</h1>
          <p className="text-dark">Enter your email and we&apos;ll send you a reset link</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  )
}
