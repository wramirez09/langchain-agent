"use client";

import React, { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * The note dropzone.
 *
 * Repurposed from the upload-a-PDF-to-the-server component this used to be. It
 * kept three `Dispatch<SetStateAction<...>>` props, two of which it never
 * read, and carried `isUploading`/`progress` state that nothing ever set —
 * leftovers from a progress bar that was removed. It now takes one callback
 * and owns no state but its own error.
 *
 * It reports the picked File and stops. It does NOT read, upload or inspect
 * it: parsing and de-identification happen in `NoteIngestDialog`, on this
 * device, and keeping those out of here means there is exactly one place where
 * a note's contents are touched.
 */

export interface FileUploadProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxSize?: number;
  /** react-dropzone `accept` map. Defaults to what the note pipeline parses. */
  accept?: Record<string, string[]>;
  /** Shown under the prompt, e.g. "PDF, TXT or MD (max 10MB)". */
  hint?: string;
}

const DEFAULT_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
};

function messageFor(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  switch (code) {
    case "file-too-large":
      return "That file is larger than 10MB. Choose a smaller one.";
    case "file-invalid-type":
      return "Attach a PDF, .txt or .md file, or paste the note instead.";
    case "too-many-files":
      return "Attach one note at a time.";
    default:
      return "That file could not be read.";
  }
}

export function FileUpload({
  onFile,
  disabled = false,
  maxSize = 10 * 1024 * 1024,
  accept = DEFAULT_ACCEPT,
  hint = "PDF, TXT or MD (max 10MB)",
}: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setError(messageFor(rejections[0]));
        return;
      }
      if (accepted[0]) {
        setError(null);
        onFile(accepted[0]);
      }
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    maxSize,
    disabled,
    noClick: disabled,
    noKeyboard: disabled,
  });

  return (
    <div className="w-full space-y-3">
      <div
        {...getRootProps()}
        data-testid="note-dropzone"
        aria-label="Attach a clinical note"
        className={cn(
          "group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
          disabled && "cursor-not-allowed opacity-50",
          isDragActive
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-primary/5",
        )}
      >
        <input {...getInputProps()} className="sr-only" />
        <div className="pointer-events-none">
          <div
            className={cn(
              "mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/5 transition-colors",
              isDragActive && "bg-primary/10",
            )}
          >
            <Upload className="size-6 text-blue-600" strokeWidth={1.5} />
          </div>
          <p className="mb-1 text-sm font-semibold text-foreground">
            {isDragActive ? "Drop the note here" : "Attach a clinical note"}
          </p>
          <p className="text-[13px] text-foreground-soft">
            <span className="font-medium text-blue-600">Choose a file</span> or
            drag and drop
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      {error ? (
        <p
          data-testid="dropzone-error"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
