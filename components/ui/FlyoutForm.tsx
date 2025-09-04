"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import FormInputs from "./forms/Form";
import { ChangeEventHandler } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
const FlyoutForm: React.FC<{
  openSheet: boolean;
  setOpenSheet: React.Dispatch<React.SetStateAction<boolean>>;
  submitAction: (e: React.FormEvent<HTMLFormElement>) => void;
  onStateFormStateChange: (key: string, value: string) => void;
  chatOnChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({
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
      [submitAction],
    );
    const [open, setOpen] = React.useState(false);
    return (
      <Sheet open={openSheet} onOpenChange={(open) => setOpenSheet(open)}>
        <SheetContent className="w-[100vw]  bg-gray-200 border border-gray-400 shadow-lg">
          <ScrollArea className="h-[100vh]">
            <SheetHeader>
              <SheetTitle className="text-xl">
                Prior Authorization Request
              </SheetTitle>
              <SheetDescription>
                Please provide the necessary patient and clinical information to
                begin the prior authorization process.
              </SheetDescription>
            </SheetHeader>
            <FormInputs
              onStateFormStateChange={onStateFormStateChange}
              chatOnChange={
                chatOnChange as unknown as ChangeEventHandler<HTMLTextAreaElement>
              }
            />
            <SheetFooter className="flex-row gap-3 mr-6">
              <Button
                type="submit"
                variant={"default"}
                className="mb-5"
                onClick={handleSubmit}
              >
                Submit
              </Button>
              <SheetClose asChild>
                <Button
                  onClick={() => setOpenSheet(false)}
                  type="submit"
                  variant="default"
                  className="bg-red-700 text-white hover:bg-gray-600 mb-5"
                >
                  Cancel
                </Button>
              </SheetClose>
            </SheetFooter>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  };
export default FlyoutForm;
