import { Button } from "./button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import * as React from "react";
import { SelectOption } from "@/data/selectOptions";
import { IconFileSearch, IconFileTypePdf, IconUpload, IconTrash } from "@tabler/icons-react";
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
    { label: "PreAuth Form", value: "form", icon: <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center"><IconFileSearch stroke={2.5} color="#0891b2" size={16} /></div> },
    { label: "File Upload", value: "upload", disabled: messages.length > 0, icon: <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center"><IconUpload stroke={2.5} color="#7c3aed" size={16} /></div> },
    { label: "PDF Export", value: "export", icon: <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><IconFileTypePdf stroke={2.5} color="#dc2626" size={16} /></div> },
    { label: "Clear Chat", value: "clear", icon: <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><IconTrash stroke={2.5} color="#dc2626" size={16} /></div> }
  ];

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="bg-white border-0 h-[90vh] flex flex-col rounded-t-2xl">
        <div className="overflow-y-auto flex-1">
          <DrawerHeader className="text-left px-4 pt-6 pb-3 bg-gray-50 border-b border-gray-200 mt-2">
            <DrawerTitle className="text-gray-900 text-xl font-bold">Options</DrawerTitle>
            <DrawerDescription className="text-gray-500 text-sm">
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
