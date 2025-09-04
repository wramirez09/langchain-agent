"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SelectOption } from "@/data/selectOptions";
import { ScrollArea } from "@radix-ui/react-scroll-area";


// This hook was moved here to fix a compilation error.
function useMediaQuery(query: string) {
  const [value, setValue] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setValue(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => setValue(event.matches);
    mediaQuery.addEventListener("change", handler);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return value;
}

export function AutoCompleteSelect({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [selectedStatus, setSelectedStatus] =
    React.useState<SelectOption | null>(null);



  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[100vw] md:w-[90%] justify-start text-gray-700 bg-gray-300 text-xs border-[#a8afba]"
          >
            {selectedStatus ? <>{selectedStatus.label}</> : <>Set Option</>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <StatusList
            setOpen={setOpen}
            setSelectedStatus={setSelectedStatus}
            options={options}
            onchange={onChange}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" className="w-full md:w-[150px] justify-start">
          {selectedStatus ? <>{selectedStatus.label}</> : <>+ Set status</>}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mt-4 border-t">
          <StatusList
            setOpen={setOpen}
            setSelectedStatus={setSelectedStatus}
            options={options}
            onchange={onChange}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function StatusList({
  setOpen,
  setSelectedStatus,
  options = [],
  onchange,
  showSearch = true,
}: {
  setOpen: (open: boolean) => void;
  setSelectedStatus: (status: SelectOption | null) => void;
  options: SelectOption[];
  onchange: (value: string) => void;
  showSearch?: boolean;
}) {
  return (
    <Command>
      {showSearch && <CommandInput placeholder="Filter status..." />}
      <CommandList className="max-h-[300px]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              className="pointer-events-auto"
              key={option.value}
              value={option.value}
              onSelect={(value) => {
                setSelectedStatus(
                  options.find((option) => option.value === value) || null,
                );
                setOpen(false);
                onchange?.(value);
              }}
            >
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export default AutoCompleteSelect;
