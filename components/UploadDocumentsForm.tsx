"use client";

import React, { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { FileUpload } from "./ui/FileUpload";

const UploadDocumentsForm: React.FC<{
  onUpload: (file: any) => Promise<any>;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ onUpload, setModalOpen }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [document, setDocument] = useState<File | undefined>();

  const handelFileUpload = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await onUpload(document);
    setIsLoading(false);
  };

  return (
    <form className="flex flex-col gap-4 w-full">
      <FileUpload
        setDocument={setDocument}
        setIsLoading={setIsLoading}
        setModalOpen={setModalOpen}
      />
      <Button type="submit" onClick={handelFileUpload}>
        <span className={isLoading ? "hidden" : ""}>Upload</span>
      </Button>
    </form>
  );
};

export default UploadDocumentsForm;
