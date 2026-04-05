"use client";

import { useState, useCallback } from "react";
import { type Message } from "ai";
import { AppSidebar, type AppView } from "@/components/AppSidebar";
import { PriorAuthView } from "@/components/PriorAuthView";
import { UploadView } from "@/components/UploadView";
import { FileExportView } from "@/components/FileExportView";

export default function AgentsPage() {
  const [activeView, setActiveView] = useState<AppView>("auth");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleUploadComplete = useCallback((generatedQuery: string) => {
    setPendingMessage(generatedQuery);
    setActiveView("auth");
  }, []);

  const handlePendingMessageConsumed = useCallback(() => {
    setPendingMessage(null);
  }, []);

  return (
    <div className="flex h-full">
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-hidden bg-[#F8F9FB]">
        <div className={activeView !== "auth" ? "hidden" : "h-full"}>
          <PriorAuthView
            onMessagesChange={setChatMessages}
            pendingMessage={pendingMessage}
            onPendingMessageConsumed={handlePendingMessageConsumed}
          />
        </div>
        <div className={activeView !== "upload" ? "hidden" : "h-full"}>
          <UploadView onUploadComplete={handleUploadComplete} />
        </div>
        <div className={activeView !== "export" ? "hidden" : "h-full"}>
          <FileExportView messages={chatMessages} />
        </div>
      </main>
    </div>
  );
}
