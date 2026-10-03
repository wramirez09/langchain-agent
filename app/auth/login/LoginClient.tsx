"use client";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { safeNext } from "@/lib/auth/safeNext";
import { Suspense, useEffect } from "react";

function LoginContent() {
  const searchParams = useSearchParams();

  const isMobile = searchParams.get("mobile") === "true";
  const redirect = searchParams.get("redirect");
  // Set by the OAuth consent page so a connector sign-in resumes after login.
  const next = safeNext(searchParams.get("next"), "/protected/preAuth");

  useEffect(() => {
    if (isMobile && redirect === "login") {
      window.location.href = "notedoctoraiapp://login?billing=success";
    }
  }, [isMobile, redirect]);

  if (isMobile && redirect === "login") {
    return null; // Prevent rendering the rest of the component
  }

  return (
    <div className="h-full flex items-center justify-center bg-gradient-light dark:bg-none p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Welcome</h1>
          <p className="text-dark dark:text-muted-foreground">Sign in to your account to continue</p>
        </div>
        <div className="bg-card rounded-xl shadow-md p-8 dark:border dark:border-border dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}

export function LoginClient() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-light dark:bg-none p-6">
      <div className="text-center">Loading...</div>
    </div>}>
      <LoginContent />
    </Suspense>
  );
}
