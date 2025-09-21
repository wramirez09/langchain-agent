"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { cn } from "@/utils/cn";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme="light"
      position="top-right"
      className="toaster"
      expand={true}
      toastOptions={{
        classNames: {
          toast: cn(
            "toast w-full max-w-sm toast-base text-white p-3 border-0"
          ),
          title: "font-semibold text-white",
          description: "text-gray-100 -mt-0.5 text-md",
          actionButton: cn(
            "bg-blue-600 text-white hover:bg-blue-700",
            "px-3 py-1.5 text-md font-medium rounded-md"
          ),
          cancelButton: cn(
            "bg-gray-600 text-white hover:bg-gray-700",
            "px-3 py-1.5 text-md font-medium rounded-md"
          ),
          loading: "[--normal-bg:white] [--normal-border:transparent] [--normal-text:white] [--spinner-color:#fff] text-white bg-white"
        },
        unstyled: false,
      }}
      visibleToasts={10}
      gap={12}
      {...props}
    />
  );
};

export { Toaster };
