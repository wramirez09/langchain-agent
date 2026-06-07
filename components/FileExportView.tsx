"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { type Message } from "ai";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderToBuffer } from "@react-pdf/renderer";
import { default as PdfDocument } from "@/components/pdf/pdf-generator";
import { default as ArtifactPdfDocument } from "@/components/pdf/ArtifactPdfDoc";
import { logoBase64 } from "@/components/pdf/logo";
import {
  usePriorAuthChat,
  usePriorAuthDocChecks,
} from "@/components/providers/PriorAuthProvider";
import {
  extractArtifact,
  looksLikeArtifact,
} from "@/lib/priorAuth/extractArtifact";
import { applyDocChecks } from "@/lib/priorAuth/docChecks";

const pdfLoading = () => (
  <div className="flex items-center justify-center h-full">
    <LoaderCircle className="animate-spin size-6 text-gray-400" />
  </div>
);

// Dynamically import the PDF viewers — must be client-only, no SSR
const PdfDoc = dynamic(() => import("@/components/PdfDoc"), {
  ssr: false,
  loading: pdfLoading,
});

const ArtifactPdfPreview = dynamic(
  () => import("@/components/pdf/ArtifactPdfPreview"),
  { ssr: false, loading: pdfLoading },
);

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

    // Structured artifact JSON is exported via the dedicated artifact PDF —
    // it must never reach the markdown renderer (raw JSON renders as garbage).
    if (message.role === "assistant" && looksLikeArtifact(message.content)) {
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

/** "Prior Authorization Summary for MRI…" → "prior-authorization-summary-for-mri…" */
function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function artifactFileName(title?: string): string {
  const base = (title && kebab(title)) || "prior-auth-report";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.pdf`;
}

export function FileExportView() {
  const { chatMessages } = usePriorAuthChat();
  const { docChecks } = usePriorAuthDocChecks();
  const [isDownloading, setIsDownloading] = useState(false);

  const filteredMessages = useMemo(() => filterMessages(chatMessages), [chatMessages]);

  // Latest assistant message parsed as a structured artifact (or null). When
  // present, both the preview and the download render the artifact PDF; the
  // markdown transcript path below stays as the fallback.
  const extracted = useMemo(() => extractArtifact(chatMessages), [chatMessages]);

  // The artifact actually rendered/downloaded: the reviewer's documentation
  // checkbox toggles (from the Output tab) overlaid on the agent's `provided`
  // flags, so the exported PDF matches what's checked off on screen.
  const artifactForPdf = useMemo(
    () =>
      extracted
        ? applyDocChecks(extracted.artifact, docChecks[extracted.messageId])
        : null,
    [extracted, docChecks],
  );

  // Stable per-conversation date string so the PDFViewer doesn't re-render
  // (and re-layout the document) on every parent render.
  const generatedAt = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extracted],
  );

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      let pdfBuffer: Uint8Array;
      let fileName: string;
      if (artifactForPdf) {
        pdfBuffer = await renderToBuffer(
          <ArtifactPdfDocument
            artifact={artifactForPdf}
            generatedAt={generatedAt}
          />
        );
        fileName = artifactFileName(artifactForPdf.title);
      } else {
        pdfBuffer = await renderToBuffer(
          <PdfDocument
            name="User"
            role="Viewer"
            messages={filteredMessages}
            logoBase64={logoBase64}
          />
        );
        fileName = `prior-auth-report-${Date.now()}.pdf`;
      }
      const blob = new Blob([new Uint8Array(pdfBuffer)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const hasReport = Boolean(extracted) || filteredMessages.length > 0;

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
        {artifactForPdf ? (
          <ArtifactPdfPreview
            artifact={artifactForPdf}
            generatedAt={generatedAt}
          />
        ) : filteredMessages.length === 0 ? (
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
