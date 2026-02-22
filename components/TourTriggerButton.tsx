"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { usePreAuthTour } from "@/components/PreAuthTour";

export function TourTriggerButton() {
  const { startTour } = usePreAuthTour();

  return (
    <Button
      onClick={startTour}
      variant="outline"
      size="sm"
      className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-lg"
    >
      Show Tour
    </Button>
  );
}
