"use client";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Form } from "multiparty";
import { FormInput } from "lucide-react";
import FormInputs from "./forms/Form";

const FlyoutForm: React.FC<{
  openSheet: boolean;
  setOpenSheet: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ openSheet, setOpenSheet }) => {
  return (
    <Sheet open={openSheet}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <FormInputs
          onStateFormStateChange={function (key: string, value: string): void {
            throw new Error("Function not implemented.");
          }}
          chatOnChange={function (
            e: React.ChangeEvent<HTMLInputElement>,
          ): void {
            throw new Error("Function not implemented.");
          }}
        />
        <SheetFooter>
          <Button type="submit">Save changes</Button>
          <SheetClose asChild>
            <Button variant="outline" onClick={() => setOpenSheet(false)}>
              Close test
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
export default FlyoutForm;
