"use client";

import React, { useState } from "react";
import { useDropzone, DropzoneInputProps } from "react-dropzone";
import { cn } from "@/utils/cn";
import { toast } from "sonner";

interface FileUploadProps {
  setDocument: (file: File | undefined) => void;
  setIsLoading: (loading: boolean) => void;
  setModalOpen: (open: boolean) => void;
  maxFiles?: number;
  maxSize?: number;
  accept?: Record<string, string[]>;
}

export function FileUpload({
  maxFiles = 1,
  maxSize = 1024 * 1024 * 10, // 10MB
  accept = { "application/pdf": [".pdf"] },
  setDocument,
  setIsLoading,
  setModalOpen,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      const errorMessage = error.code === 'file-too-large' 
        ? 'File is too large. Maximum size is 10MB.'
        : 'Invalid file type. Please upload a PDF file.';
      toast.error(errorMessage);
      return;
    }

    if (acceptedFiles.length > 0) {
      setFiles(acceptedFiles.slice(0, maxFiles));
      setDocument(acceptedFiles[0]);
      simulateUpload();
    }
  };

  const simulateUpload = () => {
    setIsUploading(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsUploading(false);
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 100);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
    noClick: isUploading,
    noKeyboard: isUploading,
  });

  return (
    <div className="w-full space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "group relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
          isDragActive 
            ? "border-blue-500 bg-blue-50/50" 
            : "border-blue-200 hover:border-blue-400 hover:bg-blue-50/30"
        )}
      >
        <input {...(getInputProps() as DropzoneInputProps)} />
        <div className="pointer-events-none">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors">
            <svg 
              className="h-8 w-8 text-blue-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-900">
            {isDragActive ? "Drop your PDF here" : "Drag and drop your PDF"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            or <span className="font-medium text-blue-600 hover:text-blue-500">browse files</span>
          </p>
          <p className="mt-2 text-xs text-gray-400">
            PDF (max. 10MB)
          </p>
        </div>
      </div>

      {files.length > 0 && !isUploading && (
        <div className="rounded-lg border border-green-100 bg-green-50 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-green-800">
                {files[0].name}
              </p>
              <p className="mt-1 text-sm text-green-700">
                Ready to upload
              </p>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="space-y-3 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {files[0]?.name || 'Document'}
            </p>
            <span className="text-xs font-medium text-blue-600">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-50">
            <div 
              className="h-full bg-blue-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">Processing your document...</p>
        </div>
      )}
    </div>
  );
}
