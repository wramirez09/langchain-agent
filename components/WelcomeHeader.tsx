"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/utils/cn";

interface WelcomeHeaderProps {
  isVisible: boolean;
  onFadeOut: () => void;
}

export function WelcomeHeader({ isVisible, onFadeOut }: WelcomeHeaderProps) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setIsFading(true);
      const timer = setTimeout(() => {
        onFadeOut();
      }, 500); // Match the CSS transition duration
      return () => clearTimeout(timer);
    } else {
      setIsFading(false);
    }
  }, [isVisible, onFadeOut]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center min-h-full text-center px-6 py-12 transition-opacity duration-500 ease-in-out",
        isFading ? "opacity-0" : "opacity-100"
      )}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
          Welcome to <span className="text-blue-500">NoteDoctor.Ai</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl mx-auto">
          AI-powered prior authorization and medical policy lookup that saves time, reduces errors, and ensures compliance.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>HIPAA Compliant</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>Secure</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>Trusted by Healthcare Professionals</span>
          </div>
        </div>
        <div className="pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 italic">
            Start by asking a question, uploading a document or fill out the form to begin your analysis
          </p>
        </div>
      </div>
    </div>
  );
}
