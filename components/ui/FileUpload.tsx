"use client";

import React, { useState, useEffect, useCallback, SetStateAction, Dispatch } from "react";
import {
  useDropzone,
  DropzoneInputProps,
} from "react-dropzone";

import { cn } from "@/utils/cn";
import { toast } from "@/utils/use-toast";

interface FileUploadProps {
  setDocument: Dispatch<SetStateAction<File | undefined>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  maxFiles?: number;
  maxSize?: number;
  accept?: Record<string, string[]>;
  progress?: number;
}

export function FileUpload({
  maxFiles = 1,
  maxSize = 1024 * 1024 * 10, // 10MB
  accept = {
    "application/pdf": [".pdf"],
  },
  setDocument,
  setIsLoading,
  setModalOpen,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const getErrorMessage = (error: any): string => {
    switch (error.code) {
      case 'file-too-large':
        return 'File exceeds 10MB limit. Please choose a smaller file.';
      case 'file-invalid-type':
        return 'Only PDF files are supported.';
      case 'too-many-files':
        return 'Please upload one file at a time.';
      default:
        return 'An error occurred while uploading. Please try again.';
    }
  };

  // Update parent document when files change
  useEffect(() => {
    if (files.length > 0) {
      setDocument(files[0]);
    } else {
      setDocument(undefined);
    }
  }, [files, setDocument]);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);

    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      const errorMessage = getErrorMessage(error);
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive",
      });
      setError(errorMessage);
      return;
    }

    if (acceptedFiles.length > 0) {
      const newFiles = acceptedFiles.slice(0, maxFiles);
      setFiles(newFiles);
      // Note: setDocument is now called via the useEffect above
      toast({
        title: "File selected",
        description: `File is ready to upload`,
      });
    }
  }, [maxFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
    noClick: isUploading,
    noKeyboard: isUploading,
  });

  return (
    <div className="w-full space-y-4 transition-all duration-200">
      <div
        {...getRootProps()}
        className={cn(
          "group relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          isDragActive
            ? "border-blue-500 bg-blue-50/70 scale-[1.01] shadow-sm"
            : "border-blue-200 hover:border-blue-400 hover:bg-blue-50/30"
        )}
        aria-label="File upload area"
      >
        <input {...(getInputProps() as DropzoneInputProps)} className="sr-only" />
        <div className="pointer-events-none">
          <div className={cn(
            "mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 mb-4",
            "transition-all duration-200 group-hover:bg-blue-100 group-hover:scale-105",
            isDragActive && "scale-110 bg-blue-100"
          )}>
            <svg
              className={cn(
                "h-9 w-9 text-blue-600 transition-transform duration-200",
                isDragActive && "scale-110"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900 mb-1">
            {isDragActive ? "Drop to upload" : "Add Your Document"}
          </p>
          <p className="text-md text-gray-600">
            <span className="font-medium text-blue-600 group-hover:text-blue-500 transition-colors">
              Choose a file
            </span>{' '}
            or drag and drop
          </p>
          <p className="mt-2 text-xs text-gray-500">
            PDF format (max 10MB)
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
              <p className="text-md font-medium text-green-800">
                {files[0].name}
              </p>
              <p className="mt-1 text-md text-green-700">
                Ready to upload
              </p>
            </div>
          </div>
        </div>
      )}
      {isUploading && (
        <div className="space-y-3 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-md font-medium text-gray-900">
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
