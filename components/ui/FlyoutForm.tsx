"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,

  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import FormInputs from "./forms/Form";
import { ChangeEventHandler } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBodyPointerEvents } from "@/utils/use-body-pointer-events";
import { AlertTriangle } from "lucide-react";
const FlyoutForm: React.FC<{
  id?: string;
  openSheet: boolean;
  setOpenSheet: React.Dispatch<React.SetStateAction<boolean>>;
  submitAction: (e: React.FormEvent<HTMLFormElement>) => void;
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({
  id,
  openSheet,
  setOpenSheet,
  submitAction,
  onStateFormStateChange,
  chatOnChange,
}) => {
    const handleSubmit = React.useCallback(
      (e: any) => {
        e.preventDefault();
        submitAction(e);
        setOpenSheet(false);
      },
      [setOpenSheet, submitAction],
    );

    return (
      <Sheet open={openSheet} onOpenChange={(open) => {
        return setOpenSheet(open)
      }} >
        <SheetContent className="w-full max-w-2xl bg-white border-blue-200 shadow-lg p-0" >
          <div className="flex flex-col h-full" id="inner-form-flyout">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-blue-100 bg-blue-50">
              <SheetTitle className="text-lg text-gray-900">
                Prior Authorization Request
              </SheetTitle>
              <SheetDescription className="text-sm text-gray-700">
                Please provide the necessary patient and clinical information to
                begin the prior authorization process.
              </SheetDescription>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800">
                    <strong>HIPAA Compliance:</strong> Do not include patient-specific PHI such as names, dates of birth, medical record numbers, or other identifying information. Use generic descriptions only.
                  </div>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 px-6 py-4" id={id || "flyout-form"}>
              <FormInputs
                onStateFormStateChange={onStateFormStateChange}
                chatOnChange={
                  chatOnChange as unknown as ChangeEventHandler<HTMLTextAreaElement>
                }
              />
            </ScrollArea>

            <div className="border-t border-blue-100 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant={"default"}
                  className="flex-1 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md hover:shadot-none"
                  onClick={handleSubmit}
                >
                  Submit
                </Button>
                <SheetClose asChild>
                  <Button
                    onClick={() => {
                      setOpenSheet(false);
                      useBodyPointerEvents(false);
                    }}
                    className="flex-1 button-ghost text-red-500"
                  >
                    Cancel
                  </Button>
                </SheetClose>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  };
export default FlyoutForm;
