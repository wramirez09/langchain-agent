"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { type Message } from "ai";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderToBuffer } from "@react-pdf/renderer";
import { default as PdfDocument } from "@/components/pdf/pdf-generator";
import { usePriorAuthChat } from "@/components/providers/PriorAuthProvider";

// Base64 logo — same as app/pdf/page.tsx
const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtCAMAAAANxBKoAAACqVBMVEUAAAAA//8AgP8AqqpAgL8zmcwrgNUkktsggN8cjsYamcwui9ErldUnidgkktsiiMwgj88eh9IcjtUmjMwkks4gi9EgitUnic4mjtAkidEjjdMiiMwikdUhjNYgj88ni9Emj9IkitMjjtUiis8hkNEgjNIlj9MkjtAji9EijtIhi9MhjdQlj9UkjdAkj9EjjNIijtMijNQhjtAli9EkjdEkj9IjjdMijNAhjtEkjtIki9Mji9EijdEij9IhjNMkjtMkjNAjjtEjjNIijdIii9MijdMkjtEkjdEkjtIjjNIjjtMijdEkjNEkjdIjjdMjjtEijNEijtIkjdMkjNMjjdEjjtEjjdIijdMkjtMkjNEjjdIjjNIijtMijdEkjtEkjdIjjtIijdEkjNIkjdIjjtMjjdMjjtEjjNIijdIijNIkjdMkjNEjjdEjjtIjjdIijtIkjdEkjNIjjdIjjdMjjtMkjtIkjdIjjdIjjNMjjdEjjNEijdIijtIkjdIjjtMjjdEjjdIjjdIijdIijNMkjdMjjNEjjdIjjtIjjdIjjdMijdEkjdIkjNIjjdIjjNIjjtEijdIkjdIkjdIjjdIjjNMjjdEjjNIjjdIijtIkjdMjjtEjjdIjjdIjjdIjjdIkjdEjjtIjjdIjjtIjjdMijdIkjdIjjNIjjdIjjtIjjtIjjdIjjdMjjdEjjdIjjNIjjdIijtIkjdMjjdIjjdIjjdIjjdIkjdIjjtIjjdIjjdIjjdIjjNIjjdIjjtMjjdIjjdIjjdIijdIjjdIjjdIjjdIjjtIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdMjjNIkjdIjjdIjjdIjjdIjjdIjjdIjjdIijdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdL///+PYGbAAAAA4XRSTlMAAQIDBAUGBwgJCgsMDQ4PEBESFBUWGBobHB0eHh8gISIjJCUnKCkrLC0uLzAxMjM0NTY3ODk6PD0/QEJDREVGR0hJSktMTU5PUFFTVFVXWFlaXF1eX2BiY2RlZmhpamtscHFyc3R1dnd4eXp7fH1+gIGChIWHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKKjpKWmp6ipqqusra6vsLGztLW2uLm6u7y9v8DDxMXGx8jJysvMzdDR09TW2Nna29zd3t/h4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f4oN+oTAAAAAWJLR0TixgGeHAAABBhJREFUGBmNwYljFQIAgPHvLZWjsknkqtTWumw1RuKhHRJzhw6E0FJSbV7H1tPh6JxCbbVJyFgRajxFGQotaiVUa7XvP/H2ttpbJX4//k2HBP5TAMbsHQ0Mqj/4EAHOofNTO+3OcxYAd+okyg6/cR1nF3hkr9qdqYaAO3UyG9SqGzmLXlXqsa1dKbAIyNWp3PTFEXVLH053/x/648Jk4GXDQK5OA25deUJ/v542zl+u39yTQJOZLgBydQZNBn+kx18M0Cqh3MZQB5rN8nUgVwuJafeFupBWczzxQGBsfv6oTsBslwA5GoLAvfn5hTvU8iAn3aeF7V81qnYAFFkC5OgsmGvM8aXjj99Bs2uPWNVugn6+rtFDnSh2JZCjRfQ/4Vcf1+vqC/fZMIKYcs3qutcymKi9mOsqIEfDLHZrIgP+cgkjG/0zQFSGumS3ToFM7UfY1UC2zuMzC4DNzoc1uoKo5Tbb3Y3pmkbY1UC2LmSZtQPIPWgIeh+24TJglS32b2zUVMKWAtn6OsknrP9O/+4HLNXpRCUlJfXs1XdirVEHuxK2FMjWRTDyqHpoCFFJh9xBq85jCkMTroCwZUC2LgX6TJ096RpivtfrOEPYMiBLS4gXqNXpPLq9ptn26upPKzcECLsGyNI3ya';

// Dynamically import PdfDoc (PDFViewer) — must be client-only, no SSR
const PdfDoc = dynamic(() => import("@/components/PdfDoc"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <LoaderCircle className="animate-spin size-6 text-gray-400" />
    </div>
  ),
});

// AI SDK 3 spreads streamed text across `message.content` (often only the
// first chunk) and `message.parts` (the full accumulated stream as one or
// more text parts). The PDF generator reads `message.content` directly,
// which produced a truncated PDF where only the heading rendered. Take the
// longer of the two so we always pick up the complete text regardless of
// which field the SDK chose to populate fully.
function normalizeContent(message: Message): Message {
  const contentText =
    typeof message.content === 'string' ? message.content : '';

  const parts = (message as Message & { parts?: Array<{ type: string; text?: string }> }).parts;
  const partsText = Array.isArray(parts)
    ? parts
        .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('\n')
    : '';

  const text = partsText.length > contentText.length ? partsText : contentText;
  return { ...message, content: text };
}

function filterMessages(messages: Message[]): Message[] {
  return messages.map(normalizeContent).filter((message) => {
    // Filter out system messages
    if (message.role === "system") return false;
    
    // Drop messages with no extractable text (after normalizeContent merged
    // any `parts`). Without this they render as empty PDF blocks.
    if (typeof message.content !== 'string' || message.content.trim().length === 0) {
      return false;
    }

    // Filter out tool call messages - be specific to avoid filtering legitimate content
    if (message.content && typeof message.content === "string") {
      const content = message.content.trim();
      
      // Only filter if it's clearly a tool call JSON object
      if (
        message.content.includes('"tool_call_id":') ||
        message.content.includes('"tool_calls":')
      ) {
        return false;
      }
      
      // Filter out pure JSON objects that are tool-related (not markdown with code blocks)
      if (
        content.startsWith("{") &&
        content.endsWith("}") &&
        (content.includes('"action":') || content.includes('"name":') && content.includes('"arguments":'))
      ) {
        return false;
      }
    }
    
    return true;
  });
}

export function FileExportView() {
  const { chatMessages } = usePriorAuthChat();
  const [isDownloading, setIsDownloading] = useState(false);

  const filteredMessages = useMemo(() => filterMessages(chatMessages), [chatMessages]);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const pdfBuffer = await renderToBuffer(
        <PdfDocument
          name="User"
          role="Viewer"
          messages={filteredMessages}
          logoBase64={logoBase64}
        />
      );
      const blob = new Blob([new Uint8Array(pdfBuffer)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prior-auth-report-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">File Export</h1>
          <p className="text-sm text-gray-500 mt-1">
            Export and download patient records and reports
          </p>
        </div>
        
      </div>

      {/* PDF Preview area */}
      <div className="flex-1 overflow-hidden m-6 rounded-lg border border-gray-200 shadow-sm bg-white">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
            <div className="size-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Download className="size-8 text-gray-400" />
            </div>
            <p className="text-gray-700 font-medium mb-2">No report generated yet</p>
            <p className="text-gray-400 text-sm">
              Go to Prior Authorization, complete a request, then return here to export the report.
            </p>
          </div>
        ) : (
          <PdfDoc name="User" role="Viewer" messages={filteredMessages} />
        )}
      </div>
    </div>
  );
}
