"use client";

import React, { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { FileUpload } from "./ui/FileUpload";
import { toast } from "sonner";

const UploadDocumentsForm: React.FC<{
  onUpload: (file: any) => Promise<any>;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ onUpload, setModalOpen, setIsLoading }) => {
  const [document, setDocument] = useState<File | undefined>();

  const handelFileUpload = async (e: FormEvent) => {
    e.preventDefault();

    await onUpload(document);
    setModalOpen(false);
  };

  return (
    <form className="flex flex-col gap-4 w-full">
      <FileUpload
        setDocument={setDocument}
        setIsLoading={setIsLoading}
        setModalOpen={setModalOpen}
      />
      <Button type="submit" onClick={handelFileUpload} className="bg-gray-400">
        <span>Submit</span>
      </Button>
    </form>
  );
};

export default UploadDocumentsForm;
