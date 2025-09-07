"use client";

import React, { Suspense } from "react";
import PdfDoc from "@/components/PdfDoc";
import { Message } from "ai/react";
import { useSearchParams } from "next/navigation";

const SuspendedPDFInner = () => {
  const params = useSearchParams();
  const stringData = params.get("data");

  let messages: Message[] = [];
  try {
    const parsedMessages = stringData ? JSON.parse(stringData) : [];
    // Filter out tool call messages and system messages
    messages = parsedMessages.filter((message: Message) => {
      // Skip if it's a system message
      if (message.role === 'system') return false;
      
      // Skip if it's a tool call message (contains action or tool_call_id)
      if (message.content && (
        (typeof message.content === 'string' && 
         (message.content.includes('"action":') || 
          message.content.includes('"tool_call_id":') ||
          message.content.includes('"tool_calls":') ||
          message.content.trim().startsWith('{') && message.content.trim().endsWith('}'))) ||
        (typeof message.content === 'object' && 
         ('action' in message.content || 'tool_call_id' in message.content || 'tool_calls' in message.content))
      )) {
        return false;
      }
      
      return true;
    });
  } catch (err) {
    console.error('Error parsing messages:', err);
    return <div>Error processing chat data</div>;
  }

  return <PdfDoc name="User" role="Viewer" messages={messages} />;
};

const SuspendedPDF = () => {
  return (
    <Suspense fallback={<div>Loading PDF...</div>}>
      <SuspendedPDFInner />
    </Suspense>
  );
};

const Page: React.FC = () => {
  return <SuspendedPDF />;
};

export default Page;
