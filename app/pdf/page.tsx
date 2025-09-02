"use client";
import PdfDoc from "@/components/PdfDoc";
import { PDFViewer } from "@react-pdf/renderer";
import { Message } from "ai/react";
import { useSearchParams } from "next/navigation";
import * as React from "react";

const Viewer = () => {
  const params = useSearchParams();
  const stringData = params.get("data");
  const data: Message[] = JSON.parse(stringData!);
  console.log("params", { data: data });
  //   let receivedData = [];
  //   if (data) {
  //     try {
  //       receivedData = JSON.parse(data as string);
  //     } catch (error) {
  //       console.error("Error parsing data from URL:", error);
  //     }
  //   }
  return (
    <PDFViewer height={"100%"}>
      <PdfDoc messages={data} name={""} role={""} />
    </PDFViewer>
  );
};

export default Viewer;
