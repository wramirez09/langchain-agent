"use client";

import { useState, useCallback } from "react";
import { AppSidebar, type AppView } from "@/components/AppSidebar";
import { PriorAuthView } from "@/components/PriorAuthView";
import { UploadView } from "@/components/UploadView";
import { FileExportView } from "@/components/FileExportView";
import { PriorAuthProvider } from "@/components/providers/PriorAuthProvider";
import { cn } from "@/utils/cn";

export default function AgentsPage() {
  const [activeView, setActiveView] = useState<AppView>("auth");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleUploadComplete = useCallback((generatedQuery: string) => {
    setPendingMessage(generatedQuery);
    setActiveView("auth");
  }, []);

  const handlePendingMessageConsumed = useCallback(() => {
    setPendingMessage(null);
  }, []);

  return (
    <PriorAuthProvider>
      <div className="flex h-full">
        <AppSidebar activeView={activeView} onViewChange={setActiveView} />
        
        {/* Keep all views mounted, toggle visibility with CSS */}
        <main className={cn(
          "flex-1 overflow-hidden bg-[#F8F9FB]",
          activeView !== "auth" && "hidden"
        )}>
          <PriorAuthView
            pendingMessage={pendingMessage}
            onPendingMessageConsumed={handlePendingMessageConsumed}
          />
        </main>

        <main className={cn(
          "flex-1 overflow-hidden bg-[#F8F9FB]",
          activeView !== "upload" && "hidden"
        )}>
          <UploadView onUploadComplete={handleUploadComplete} />
        </main>

        <main className={cn(
          "flex-1 overflow-hidden bg-[#F8F9FB]",
          activeView !== "export" && "hidden"
        )}>
          <FileExportView />
        </main>
      </div>
    </PriorAuthProvider>
  );
}
