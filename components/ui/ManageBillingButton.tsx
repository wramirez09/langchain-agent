"use client";

import { useState } from "react";

export default function ManageBillingButton() {
    const [loading, setLoading] = useState(false);

    const handlePortal = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/stripe/billing", {
                method: "POST",
            });
            console.log(res);

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            window.location.href = data.url;
        } catch (err) {
            console.error("Portal error:", err);
            alert("Unable to open billing portal.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handlePortal}
            className="px-4 py-2 bg-blue-600 text-white rounded"
            disabled={loading}
        >
            {loading ? "Loading..." : "Manage Billing"}
        </button>
    );
}
