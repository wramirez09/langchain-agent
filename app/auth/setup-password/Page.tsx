"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";

export default function SetupPasswordPage() {
    const router = useRouter();
    const params = useSearchParams();
    const email = params.get("email");

    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError("Email is missing from link — please retry the signup process.");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const res = await fetch("/api/stripe/setup-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to set up password.");

            // Redirect user after successful setup
            router.push(data.redirect || "/auth/sign-up");
        } catch (err: any) {
            console.error("Setup password error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-xl font-semibold text-center">
                        Set Your Password
                    </CardTitle>
                    <CardDescription className="text-center">
                        Complete your account setup to access your dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <p className="text-sm text-center text-red-600">{error}</p>
                        )}
                        <div>
                            <Label>Email</Label>
                            <Input type="email" value={email || ""} disabled />
                        </div>

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
                            disabled={loading}
                            className="w-full mt-2"
                        >
                            {loading ? "Saving..." : "Finish Setup"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
