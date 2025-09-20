'use client';

import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

export function LoadingOverlay({ isLoading, message = 'Signing in...' }: LoadingOverlayProps) {
    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-lg bg-white p-6 shadow-lg">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-gray-700">{message}</p>
            </div>
        </div>
    );
}
