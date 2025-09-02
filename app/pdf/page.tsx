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
    messages = stringData ? JSON.parse(stringData) : [];
  } catch (err) {
    return <div>Invalid data</div>;
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
