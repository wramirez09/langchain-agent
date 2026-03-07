"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, File, X, Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  status: "uploading" | "complete" | "error";
  progress: number;
}

interface UploadViewProps {
  onUploadComplete?: (generatedQuery: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadView({ onUploadComplete }: UploadViewProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size exceeds 10MB limit");
      return;
    }

    const fileId = Date.now().toString();
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: formatFileSize(file.size),
      status: "uploading",
      progress: 0,
    };
    setFiles((prev) => [...prev, newFile]);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      toast.info("Uploading document…");
      const response = await fetch("/api/retrieval/ingest", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Failed to process document");
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, status: "complete", progress: 100 } : f)),
      );
      toast.success("Document processed successfully!");

      if (data.generatedQuery && onUploadComplete) {
        onUploadComplete(data.generatedQuery);
      }
    } catch (error: unknown) {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, status: "error", progress: 0 } : f)),
      );
      const msg = error instanceof Error ? error.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(processFile);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900">Document Upload</h1>
        <p className="text-sm text-gray-500 mt-1">Upload and manage patient documents</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Drop zone card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-blue-400",
              )}
            >
              <div className="size-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="size-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Files</h3>
              <p className="text-sm text-gray-500 mb-4">
                Drag and drop your files here, or click to browse
              </p>
              <Button
                type="button"
                disabled={uploading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <LoaderCircle className="animate-spin size-4" />
                    Uploading…
                  </span>
                ) : (
                  "Choose Files"
                )}
              </Button>
              <p className="text-xs text-gray-400 mt-4">
                Supported formats: PDF, DOC, DOCX, JPG, PNG &bull; Max size: 10MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Uploaded Files ({files.length})
              </h3>
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="size-10 bg-blue-50 rounded flex items-center justify-center flex-shrink-0">
                      <File className="size-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{file.size}</p>
                      {file.status === "uploading" && (
                        <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full animate-pulse w-1/2" />
                        </div>
                      )}
                    </div>

                    {file.status === "complete" && (
                      <div className="size-8 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="size-4 text-green-600" />
                      </div>
                    )}
                    {file.status === "uploading" && (
                      <LoaderCircle className="animate-spin size-4 text-blue-500 flex-shrink-0" />
                    )}

                    <button
                      onClick={() => removeFile(file.id)}
                      className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
