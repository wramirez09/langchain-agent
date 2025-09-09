"use client";

import React, { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { FileUpload } from "./ui/FileUpload";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/utils/cn";

const UploadDocumentsForm: React.FC<{
  onUpload: (file: any) => Promise<any>;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  uploading: boolean;
}> = ({ onUpload, setModalOpen, setIsLoading, uploading }) => {
  const [document, setDocument] = useState<File | undefined>();

  const handleFileUpload = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!document) {
      console.error('No document selected');
      toast.error('Please select a file to upload');
      return;
    }

    console.log('Starting file upload with document:', {
      name: document.name,
      type: document.type,
      size: document.size
    });

    try {
      setIsLoading(true);
      console.log('Calling onUpload with document...');
      await onUpload(document);
      console.log('File upload successful');
      setModalOpen(false);
      toast.success('File uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      console.log('Upload process completed');
      setIsLoading(false);
    }
  };

  return (
    <form className="relative flex flex-col gap-6 w-full">
      <div className="space-y-6">
        <div className="flex items-center justify-center w-full">
          <FileUpload
            setDocument={setDocument}
            setIsLoading={setIsLoading}
            setModalOpen={setModalOpen}
          />
        </div>
      </div>

      <div className="w-full">
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => setModalOpen(false)}
            className="w-full sm:w-[120px] px-5 text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={uploading || !document}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleFileUpload}
            className={cn(
              "w-full sm:w-[180px] px-6 text-white transition-colors",
              "bg-blue-600 hover:bg-blue-700",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
              "disabled:opacity-70 disabled:cursor-not-allowed"
            )}
            disabled={uploading || !document}
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <LoaderCircle className="animate-spin h-4 w-4" />
                Uploading...
              </span>
            ) : (
              'Upload & Process'
            )}
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
          <div className="flex flex-col items-center gap-3">
            <LoaderCircle className="animate-spin h-10 w-10 text-[#1e7dbf]" />
            <p className="font-medium text-gray-800">Processing your document</p>
            <p className="text-sm text-gray-500">This may take a moment...</p>
          </div>
        </div>
      )}
    </form>
  );
};

export default UploadDocumentsForm;
