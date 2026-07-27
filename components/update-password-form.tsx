"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/utils/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// This page serves two distinct flows on the same URL:
//  - "recovery": a password reset. /auth/callback has already exchanged the
//    PKCE code, so a Supabase session exists and we update the password on it.
//  - "setup": post-Stripe-checkout account setup. No session yet; we hand the
//    checkout session_id to the server, which verifies the paid session before
//    setting the password via admin.
type Mode = "loading" | "recovery" | "setup";

function UpdatePasswordFormCore() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session_id");
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState((params.get("email") ?? "").toLowerCase());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A live Supabase session means we arrived via the recovery callback; without
  // one we're in the checkout-setup flow and rely on the session_id instead.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setMode(data.session ? "recovery" : "setup");
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);

      if (mode === "recovery") {
        // The recovery session is already established; set the new password on it.
        const supabase = createClient();
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) throw new Error(updateError.message);
        router.push("/agents");
        return;
      }

      // Checkout-setup flow: the server verifies the Stripe session_id before
      // setting the password, so the account can only be claimed by whoever paid.
      if (!email) {
        setError("Email is missing from link — please retry the signup process.");
        return;
      }
      if (!sessionId) {
        setError("Missing checkout session. Please use the link from your email.");
        return;
      }

      const res = await fetch("/api/stripe/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, session_id: sessionId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set up password.");

      // API already signed user in; just follow redirect
      router.push(data.redirect || "/protected");
    } catch (err: any) {
      console.error("Update password error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isRecovery = mode === "recovery";

  return (
    <div className="flex  items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-center">
            {isRecovery ? "Reset Your Password" : "Set Your Password"}
          </CardTitle>
          <CardDescription className="text-center">
            {isRecovery
              ? "Choose a new password for your account."
              : "Complete your account setup to access your dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-center text-red-600">{error}</p>
            )}

            {!isRecovery && (
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                  placeholder="Enter your email"
                />
              </div>
            )}

            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || mode === "loading"}
              className="w-full mt-2 bg-blue-600 text-white"
            >
              {loading
                ? "Saving..."
                : isRecovery
                  ? "Update Password"
                  : "Finish Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function UpdatePasswordForm() {
  return <Suspense><UpdatePasswordFormCore /></Suspense>
}
