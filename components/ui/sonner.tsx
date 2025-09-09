"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { cn } from "@/utils/cn";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme="dark"
      position="top-right"
      className="toaster group"
      toastOptions={{
        style: {
          background: '#1f2937', // bg-neutral-800
          border: '1px solid #374151', // border-gray-700
          color: 'white',
          margin: '0.5rem 0',
          zIndex: 100,
        },
        classNames: {
          toast: cn(
            "group toast w-full max-w-sm"
          ),
          title: "font-semibold text-white",
          description: "text-gray-100 -mt-0.5 text-sm",
          actionButton: cn(
            "bg-blue-600 text-white hover:bg-blue-700",
            "px-3 py-1.5 text-sm font-medium rounded-md"
          ),
          cancelButton: cn(
            "bg-gray-600 text-white hover:bg-gray-700",
            "px-3 py-1.5 text-sm font-medium rounded-md"
          ),
        },
        unstyled: false,
      }}
      visibleToasts={3}
      gap={12}
      {...props}
    />
  );
};

export { Toaster };
