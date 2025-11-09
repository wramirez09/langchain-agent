"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function SetupPasswordPage() {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const params = useSearchParams();
    const router = useRouter();
    const email = params.get("email"); // passed from Stripe success_url

    useEffect(() => {
        if (!email) {
            setError("Email missing in URL. Please retry payment.");
        }
    }, [email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setLoading(true);
        const supabase = createClient();

        const { error: updateError } = await supabase.auth.updateUser({
            email,
            password,
        });

        if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
        }

        router.push("/dashboard");
    };

    return (
        <div className="flex min-h-screen items-center justify-center">
            <form
                onSubmit={handleSubmit}
                className="space-y-4 w-full max-w-sm p-6 rounded-lg shadow bg-white"
            >
                <h2 className="text-xl font-semibold text-center">Set your password</h2>
                {error && <p className="text-red-600 text-center">{error}</p>}

                <div>
                    <Label>Email</Label>
                    <Input type="email" value={email || ""} disabled />
                </div>

                <div>
                    <Label>Password</Label>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Saving..." : "Finish Setup"}
                </Button>
            </form>
        </div>
    );
}
