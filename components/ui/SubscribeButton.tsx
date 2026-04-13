"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SubscribeButtonProps {
    email: string;
    name: string;
    disabled: boolean;
}

export function SubscribeButton({ email, disabled, name }: SubscribeButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubscribe = async () => {
        if (isLoading) return;

        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                email,
                name,
            });
            window.location.href = `/auth/accept-terms?${params.toString()}`;
        } catch (err: unknown) {
            console.error("Navigation error:", err);
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
            className="max-w-50 bg-gradient-to-b from-blue-500 to-blue-600 text-white"
            
        >
            {isLoading ? "Processing..." : "Subscribe"}
        </Button>
    );
}