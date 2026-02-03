"use client";

import React, { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Message } from "ai/react";
import { useSearchParams } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { default as PdfDocument } from "../../lib/pdf-generator";

// Dynamically import PdfDoc to prevent server-side rendering
const PdfDoc = dynamic(() => import("@/components/PdfDoc"), {
  ssr: false,
  loading: () => <div>Loading PDF viewer...</div>
});

// Base64 encoded logo as a data URL
const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtCAMAAAANxBKoAAACqVBMVEUAAAAA//8AgP8AqqpAgL8zmcwrgNUkktsggN8cjsYamcwui9ErldUnidgkktsiiMwgj88eh9IcjtUmjMwkks4gi9EgitUnic4mjtAkidEjjdMiiMwikdUhjNYgj88ni9Emj9IkitMjjtUiis8hkNEgjNIlj9MkjtAji9EijtIhi9MhjdQlj9UkjdAkj9EjjNIijtMijNQhjtAli9EkjdEkj9IjjdMijNAhjtEkjtIki9Mji9EijdEij9IhjNMkjtMkjNAjjtEjjNIijdIii9MijdMkjtEkjdEkjtIjjNIjjtMijdEkjNEkjdIjjdMjjtEijNEijtIkjdMkjNMjjdEjjtEjjdIijdMkjtMkjNEjjdIjjNIijtMijdEkjtEkjdIjjtIijdEkjNIkjdIjjtMjjdMjjtEjjNIijdIijNIkjdMkjNEjjdEjjtIjjdIijtIkjdEkjNIjjdIjjdMjjtMkjtIkjdIjjdIjjNMjjdEjjNEijdIijtIkjdIjjtMjjdEjjdIjjdIijdIijNMkjdMjjNEjjdIjjtIjjdIjjdMijdEkjdIkjNIjjdIjjNIjjtEijdIkjdIkjdIjjdIjjNMjjdEjjNIjjdIijtIkjdMjjtEjjdIjjdIjjdIjjdIkjdEjjtIjjdIjjtIjjdMijdIkjdIjjNIjjdIjjtIjjtIjjdIjjdMjjdEjjdIjjNIjjdIijtIkjdMjjdIjjdIjjdIjjdIkjdIjjtIjjdIjjdIjjdIjjNIjjdIjjtMjjdIjjdIjjdIijdIjjdIjjdIjjdIjjtIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdMjjNIkjdIjjdIjjdIjjdIjjdIjjdIjjdIijdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdIjjdL///+PYGbAAAAA4XRSTlMAAQIDBAUGBwgJCgsMDQ4PEBESFBUWGBobHB0eHh8gISIjJCUnKCkrLC0uLzAxMjM0NTY3ODk6PD0/QEJDREVGR0hJSktMTU5PUFFTVFVXWFlaXF1eX2BiY2RlZmhpamtscHFyc3R1dnd4eXp7fH1+gIGChIWHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKKjpKWmp6ipqqusra6vsLGztLW2uLm6u7y9v8DDxMXGx8jJysvMzdDR09TW2Nna29zd3t/h4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f4oN+oTAAAAAWJLR0TixgGeHAAABBhJREFUGBmNwYljFQIAgPHvLZWjsknkqtTWumw1RuKhHRJzhw6E0FJSbV7H1tPh6JxCbbVJyFgRajxFGQotaiVUa7XvP/H2ttpbJX4//k2HBP5TAMbsHQ0Mqj/4EAHOofNTO+3OcxYAd+okyg6/cR1nF3hkr9qdqYaAO3UyG9SqGzmLXlXqsa1dKbAIyNWp3PTFEXVLH053/x/648Jk4GXDQK5OA25deUJ/v542zl+u39yTQJOZLgBydQZNBn+kx18M0Cqh3MZQB5rN8nUgVwuJafeFupBWczzxQGBsfv6oTsBslwA5GoLAvfn5hTvU8iAn3aeF7V81qnYAFFkC5OgsmGvM8aXjj99Bs2uPWNVugn6+rtFDnSh2JZCjRfQ/4Vcf1+vqC/fZMIKYcs3qutcymKi9mOsqIEfDLHZrIgP+cgkjG/0zQFSGumS3ToFM7UfY1UC2zuMzC4DNzoc1uoKo5Tbb3Y3pmkbY1UC2LmSZtQPIPWgIeh+24TJglS32b2zUVMKWAtn6OsknrP9O/+4HLNXpRCUlJfXs1XdirVEHuxK2FMjWRTDyqHpoCFFJh9xBq85jCkMTroCwZUC2LgX6TJ096RpivtfrOEPYMiBLS4gXqNXpPLq9ptn26upPKzcECLsGyNI3ya';

// Function to detect mobile device
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const SuspendedPDFInner = () => {
  const params = useSearchParams();
  const stringData = params.get("data");
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Memoize messages to prevent useEffect re-running
  const messages = useMemo(() => {
    let parsedMessages: Message[] = [];
    try {
      parsedMessages = stringData ? JSON.parse(stringData) : [];
      // Filter out tool call messages and system messages
      return parsedMessages.filter((message: Message) => {
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
      return [];
    }
  }, [stringData]);

  // Auto-generate PDF for mobile devices
  const generatePDF = useCallback(async () => {
    if (isMobileDevice() && messages.length > 0 && !isDownloading && !pdfGenerated) {
      setIsDownloading(true);
      try {
        // Generate PDF
        const pdfBuffer = await renderToBuffer(
          <PdfDocument name="User" role="Viewer" messages={messages} logoBase64={logoBase64} />
        );

        // Create blob and URL
        const uint8Array = new Uint8Array(pdfBuffer);
        const blob = new Blob([uint8Array], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Set the URL for download
        setPdfUrl(url);
        setPdfGenerated(true);
      } catch (error) {
        console.error('Error generating PDF:', error);
      } finally {
        setIsDownloading(false);
      }
    }
  }, [messages, isDownloading, pdfGenerated]);

  useEffect(() => {
    generatePDF();
  }, [generatePDF]);

  // Cleanup URL when component unmounts
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Show loading state for mobile while downloading
  if (isMobileDevice()) {
    if (pdfGenerated && !isDownloading && pdfUrl) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">PDF Ready</h2>
            <p className="text-gray-600 mb-6">Your PDF has been generated and is ready to download.</p>
            <div className="space-y-3">
              <a 
                href={pdfUrl}
                download={`medauth-chat-${Date.now()}.pdf`}
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-medium"
              >
                📄 Download PDF
              </a>
              <button 
                onClick={() => window.close()}
                className="block mx-auto text-gray-600 hover:text-gray-800 text-sm"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Generating PDF...</h2>
          <p className="text-gray-600">Your PDF is being prepared.</p>
        </div>
      </div>
    );
  }

  // Only show PDF viewer on desktop devices
  if (!isMobileDevice()) {
    return <PdfDoc name="User" role="Viewer" messages={messages} />;
  }

  // Fallback for any other cases
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">PDF Export</h2>
        <p className="text-gray-600">Please use a desktop browser to view the PDF.</p>
      </div>
    </div>
  );
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
