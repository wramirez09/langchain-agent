"use client";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Suspense, useEffect } from "react";

function LoginContent() {
  const searchParams = useSearchParams();

  const isMobile = searchParams.get("mobile") === "true";
  const redirect = searchParams.get("redirect");

  useEffect(() => {
    if (isMobile && redirect === "login") {
      window.location.href = "notedoctoraiapp://login?billing=success";
    }
  }, [isMobile, redirect]);

  if (isMobile && redirect === "login") {
    return null; // Prevent rendering the rest of the component
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-light p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-dark">Sign in to your account to continue</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-light p-6">
      <div className="text-center">Loading...</div>
    </div>}>
      <LoginContent />
    </Suspense>
  );
}