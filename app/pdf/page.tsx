"use client";

import React, { Suspense } from "react";

import PdfDoc from "@/components/PdfDoc";
import { Message } from "ai/react";
import { useSearchParams } from "next/navigation";

const SuspendedPDF = () => {
  const params = useSearchParams();
  const stringData = params.get("data");

  let messages: Message[] = [];
  try {
    messages = stringData ? JSON.parse(stringData) : [];
  } catch (err) {
    return <div>Loading...</div>;
  }
  return (
    <Suspense>
      <PdfDoc name="User" role="Viewer" messages={messages} />
    </Suspense>
  );
};

const Page: React.FC = () => {
  return <SuspendedPDF />;
};

export default Page;
