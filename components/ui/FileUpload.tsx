"use client";

import React, { useState, useEffect, SetStateAction, Dispatch } from "react";
import {
  useDropzone,
  DropzoneRootProps,
  DropzoneInputProps,
} from "react-dropzone";
import { Button } from "./button";
import { Progress } from "./progress";

import { cn } from "@/utils/cn";
import { IconDragDrop } from "@tabler/icons-react";
import { toast } from "react-toastify";

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
  maxFiles = 5,
  maxSize = 1024 * 1024 * 10, // 10MB
  accept = {
    "image/*": [".jpeg", ".png", ".gif", ".svg"],
    "application/pdf": [".pdf"],
  },
  setDocument,
  setIsLoading,
  setModalOpen,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [progress, setProgress] = useState(0);

  const onDrop = (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      toast("Some files were rejected. Please check file type and size.");
    }

    if (acceptedFiles.length > 0) {
      setFiles((prev) => [...prev, ...acceptedFiles].slice(0, maxFiles));
      setDocument(acceptedFiles[0]);
      setIsUploading(true);
      console.log({ acceptedFiles });
      const progressArr = new Array(100);
      progressArr.fill(0);
      progressArr.forEach((_, index) => {
        setTimeout(
          () => {
            setProgress(index + 1);
          },
          index + 1 * 2000,
        );
      });
    }
  };

  const {
    getRootProps,
    getInputProps,
    isDragActive,
  }: {
    getRootProps: () => DropzoneRootProps;
    getInputProps: () => DropzoneInputProps;
    isDragActive: boolean;
  } = useDropzone({
    onDrop,
    maxFiles,
    maxSize,
    accept,
  });

  return (
    <div className="space-y-4 bg-black">
      <div
        {...getRootProps()}
        className={cn(
          "flex h-48 w-full cursor-pointer items-center justify-center rounded-md border-2 border-dashed transition-colors",
          isDragActive
            ? "border-primary bg-primary/10"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-500",
        )}
      >
        <input {...getInputProps()} />
        <div className="text-center">
          {isDragActive ? (
            <p className="text-primary-foreground">Drop the files here ...</p>
          ) : (
            <p className="flex flex-row items-center">
              <IconDragDrop
                stroke={1.25}
                width={25}
                height={25}
                className="mr-1"
              />
              Drag 'n' drop some files here, or click to select files
            </p>
          )}
        </div>
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Selected files ({files.length}):
          </p>
          <ul className="divide-y rounded-md border">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between p-2"
              >
                <div className="flex items-center gap-2">
                  <span>{file.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isUploading && (
        <div className="flex-row space-y-2">
          <p className="text-sm font-medium">Uploading...</p>
          {`${progress}%`}
          <Progress value={progress} />
        </div>
      )}
    </div>
  );
}
