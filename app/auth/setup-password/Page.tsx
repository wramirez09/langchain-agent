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
    const [supabase] = useState(createClient());

    useEffect(() => {
        if (!email) {
            setError("Missing email. Please retry signup.");
            return;
        }

        // Check if user is already signed in
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setError("Session expired. Please sign in again.");
            }
        };
        checkSession();
    }, [email, supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;

        setLoading(true);
        setError(null);

        try {
            // Get the current user's session
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                throw new Error("User not authenticated. Please sign in again.");
            }

            // Update password and mark email confirmed
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                email_confirm: true,
            });
            if (updateError) throw updateError;

            // Ensure profile exists
            const { error: profileError } = await supabase
                .from("profiles")
                .upsert({
                    id: user.id,
                    email,
                    updated_at: new Date().toISOString(),
                });
            if (profileError) throw profileError;

            // Refresh the session to ensure all claims are up to date
            await supabase.auth.refreshSession();

            router.push("/auth/login");
        } catch (err: any) {
            console.error(err);
            setError(err?.message || "Failed to set up password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center">
            <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm p-6 rounded-lg shadow bg-white">
                <h2 className="text-xl font-semibold text-center">Set your password</h2>
                {error && <p className="text-red-600 text-center">{error}</p>}

                <div>
                    <label>Email</label>
                    <input type="email" value={email || ""} disabled className="w-full p-2 border rounded" />
                </div>

                <div>
                    <label>Password</label>
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
