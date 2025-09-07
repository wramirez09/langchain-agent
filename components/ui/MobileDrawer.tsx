import { Button } from "./button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import * as React from "react";
import { SelectOption } from "@/data/selectOptions";
import { IconFileSearch, IconFileTypePdf, IconUpload } from "@tabler/icons-react";
import { StatusList } from "./AutoCompleteSelect";
import { type Message } from "ai";

const MobileDrawer: React.FC<{
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onChange: (value: string) => void;
  open: boolean;
  showSearch?: boolean;
  messages: Message[];
}> = ({ setOpen, onChange, open, showSearch = false, messages }) => {
  const options: SelectOption[] = [
    { label: "PreAuth Form", value: "form", icon: <IconFileSearch stroke={1.5} /> },
    { label: "File Upload", value: "upload", disabled: messages.length > 0, icon: <IconUpload stroke={1.5} /> },
    { label: "PDF Export", value: "export", icon: <IconFileTypePdf stroke={1.5} /> }
  ];

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="bg-blue-50 border-blue-200 h-[90vh] flex flex-col">
        <div className="overflow-y-auto flex-1">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-gray-900">Options</DrawerTitle>
            <DrawerDescription className="text-gray-700">
              Select an action to continue.
            </DrawerDescription>
          </DrawerHeader>
          <StatusList
            setOpen={setOpen}
            options={options}
            onChange={onChange}
            showSearch={showSearch}

          />
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileDrawer;
