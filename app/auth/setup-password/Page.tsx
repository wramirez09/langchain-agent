"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/client";

export default function SetupPasswordPage() {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const params = useSearchParams();
    const router = useRouter();
    const email = params.get("email");

    useEffect(() => {
        if (!email) setError("Email missing. Please retry the signup process.");
    }, [email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError("Please enter a password.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Call secure API route with credentials
            const res = await fetch("/api/stripe/setup-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: 'include', // Important for sending cookies
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Setup failed");

            // Sign in
            const supabase = createClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) throw signInError;

            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center">
            <form
                onSubmit={handleSubmit}
                className="space-y-4 w-full max-w-sm p-6 rounded-lg shadow bg-white"
            >
                <h2 className="text-xl font-semibold text-center text-gray-800">Set your password</h2>
                {error && <p className="text-red-600 text-center">{error}</p>}

                <div>
                    <label className="text-gray-800">Email</label>
                    <input type="email" value={email || ""} disabled className="w-full p-2 border rounded" />
                </div>

                <div>
                    <label className="text-gray-800">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full p-2 border rounded"
                    />
                </div>

                <button type="submit" className="w-full p-2 bg-blue-600 text-white rounded" disabled={loading}>
                    {loading ? "Saving..." : "Finish Setup"}
                </button>
            </form>
        </div>
    );
}
