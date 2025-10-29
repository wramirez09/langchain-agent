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
import { cn } from "@/utils/cn";
import { useMediaQuery } from "@/utils/use-media-query";

export function AutoCompleteSelect({
  options,
  onChange,
  disabled = false,
}: {
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [selectedStatus, setSelectedStatus] =
    React.useState<SelectOption | null>(null);



  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild className="w-full">
          <Button
            variant="outline"
            className={cn(
              "w-full justify-between text-gray-900 bg-white text-md border-blue-200",
              "hover:bg-blue-50 hover:border-blue-300 h-10 px-3",
              "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none hover:text-gray-900",
            )}
          >
            <span className={cn("truncate", !selectedStatus && "text-gray-500")}>
              {selectedStatus?.label || "Select an option"}
            </span>
            <svg
              className={cn(
                "ml-2 h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200",
                open && "rotate-180"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0 border border-gray-200 bg-white shadow-lg rounded-lg overflow-hidden"
          align="start"
          sideOffset={8}
          side="bottom"
        >
          <StatusList
            setOpen={setOpen}
            setSelectedStatus={setSelectedStatus}
            options={options}
            onChange={onChange}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" className="w-full md:w-[150px] justify-start text-gray-900 bg-blue-50 border-blue-200 hover:bg-blue-100">
          {selectedStatus ? <>{selectedStatus.label}</> : <>+ Set status</>}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[90vh] flex flex-col bg-blue-50 border-blue-200">
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-blue-50/95 backdrop-blur-sm px-4 pt-4 pb-2 border-b border-blue-100">
            <h3 className="text-lg font-medium text-gray-900">Select an option</h3>
            <p className="text-md text-gray-500 mt-0.5">Choose from the available options</p>
          </div>
          <div className="p-4">
            <StatusList
              setOpen={setOpen}
              setSelectedStatus={setSelectedStatus}
              options={options}
              onChange={onChange}
              disabled={disabled}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function StatusList({
  setOpen,
  setSelectedStatus,
  options = [],
  onChange,
  showSearch = true,
  disabled = false,
}: {
  setOpen: (open: boolean) => void;
  setSelectedStatus?: (status: SelectOption | null) => void;
  options: SelectOption[];
  onChange: (value: string) => void;
  showSearch?: boolean;
  disabled?: boolean;
}) {
  return (
    <Command
      className="bg-white rounded-lg border border-blue-100 shadow-sm flex flex-col h-full"
      shouldFilter={true}
      loop={true}

      filter={(value, search) => {
        const option = options.find(opt => opt.value === value);
        if (!option) return 0;

        const searchLower = search.toLowerCase().trim();
        if (!searchLower) return 1; // Show all items when no search

        const labelLower = option.label.toLowerCase();
        const valueLower = option.value.toLowerCase();

        // Check if search term matches the beginning of label or value (higher priority)
        if (labelLower.startsWith(searchLower) || valueLower.startsWith(searchLower)) {
          return 1;
        }

        // Check if search term is contained anywhere in label or value
        if (labelLower.includes(searchLower) || valueLower.includes(searchLower)) {
          return 0.8;
        }

        return 0;
      }}
    >
      {showSearch && (
        <div className="px-3 pt-2 pb-1.5 border-b border-blue-100 bg-white">
          <CommandInput
            placeholder="Search options..."
            className="w-full bg-white text-gray-900 focus-visible:ring-0 focus-visible:ring-offset-0 border-0 focus-visible:outline-none"
          />
        </div>
      )}

      <CommandList className="bg-white rounded-b-md">
        <CommandEmpty className="text-gray-700 p-2">No results found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              disabled={!option.isEnabled}
              onSelect={() => {
                setSelectedStatus?.(option);
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-md text-gray-800 rounded-md",
                "hover:bg-gray-100 cursor-pointer transition-colors duration-150",
                "active:bg-gray-200 focus:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-200"
              )}
            >
              <div className="flex items-center">
                {option.icon && <span className="mr-2">{option.icon}</span>}
                {option.label}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

    </Command>
  );
}

export default AutoCompleteSelect;