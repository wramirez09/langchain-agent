"use client";

import React from "react";
import { PDFViewer } from "@react-pdf/renderer";
import type { PartialPriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";
import ArtifactPdfDocument from "./ArtifactPdfDoc";

/**
 * In-browser preview of the artifact PDF. Same document tree as the download
 * path (FileExportView's renderToBuffer), so what you preview is what you get.
 * Memoized: FileExportView memoizes `artifact`, so this only re-renders when
 * the underlying chat messages actually change.
 */
const ArtifactPdfPreview = React.memo(function ArtifactPdfPreview({
  artifact,
  generatedAt,
}: {
  artifact: PartialPriorAuthArtifact;
  generatedAt: string;
}) {
  return (
    <PDFViewer width="100%" height="100%">
      <ArtifactPdfDocument artifact={artifact} generatedAt={generatedAt} />
    </PDFViewer>
  );
});

export default ArtifactPdfPreview;
