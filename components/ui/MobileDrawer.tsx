import { Button } from "./button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import * as React from "react";
import { SelectOption } from "@/data/selectOptions";
import { StatusList } from "./AutoCompleteSelect";

const options: SelectOption[] = [
  { label: "PreAuth Form", value: "form" },
  { label: "File Upload", value: "upload" },
  { label: "PDF Export", value: "export" }
]

const MobileDrawer: React.FC<{
  setOpen: any;
  onChange: any;
  open: boolean;
  showSearch?: boolean
}> = ({ setOpen, onChange, open, showSearch = false }) => {
  const [selectedStatus, setSelectedStatus] =
    React.useState<SelectOption | null>(null);
  return (
    <Drawer open={open} onOpenChange={setOpen} >

      <DrawerContent className="bg-gray-300 border-[#a8afba] h-[60vh]">
        <div className="mt-4 border-t">
          <StatusList
            setOpen={setOpen}
            setSelectedStatus={setSelectedStatus}
            options={options}
            onchange={onChange}
            showSearch={showSearch}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileDrawer;
