"use client";

import { useState } from "react";
import { Button } from "./button";
import { IconChalkboard } from "@tabler/icons-react";

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
        <Button
            onClick={handlePortal}
            disabled={loading}
            variant="default"
            size={"sm"}
            className="text-[#1e7dbf] hover:bg-[#e1f0fb] font-medium rounded-lg px-4 py-2"

        >   <IconChalkboard width={16} />
            {loading ? "Loading..." : "Manage Billing"}
        </Button>
    );
}
