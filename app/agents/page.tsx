"use client";

import { useState, useCallback } from "react";
import { type Message } from "ai";
import { motion, AnimatePresence } from "framer-motion";
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
      <AnimatePresence mode="wait" initial={false}>
        {activeView === "auth" && (
          <motion.main
            key="auth"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ 
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="flex-1 overflow-hidden bg-[#F8F9FB]"
          >
            <PriorAuthView
              onMessagesChange={setChatMessages}
              pendingMessage={pendingMessage}
              onPendingMessageConsumed={handlePendingMessageConsumed}
            />
          </motion.main>
        )}
        {activeView === "upload" && (
          <motion.main
            key="upload"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ 
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="flex-1 overflow-hidden bg-[#F8F9FB]"
          >
            <UploadView onUploadComplete={handleUploadComplete} />
          </motion.main>
        )}
        {activeView === "export" && (
          <motion.main
            key="export"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ 
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="flex-1 overflow-hidden bg-[#F8F9FB]"
          >
            <FileExportView messages={chatMessages} />
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}
