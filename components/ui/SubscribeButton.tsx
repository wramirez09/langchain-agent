"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SubscribeButtonProps {
    priceId: string;
    email: string;
    disabled: boolean;
}

export function SubscribeButton({ priceId, email, disabled }: SubscribeButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubscribe = async () => {
        if (isLoading) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/stripe/create-checkout-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priceId, email }),
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No URL returned from server");
            }
        } catch (err: unknown) {
            console.error("Subscription error:", err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
            alert(`Error: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSubscribe}
            disabled={disabled || isLoading}
            aria-busy={isLoading}
            size={"lg"}
            className="max-w-50"
            variant={"secondary"}
        >
            {isLoading ? "Processing..." : "Subscribe"}
        </Button>
    );
}