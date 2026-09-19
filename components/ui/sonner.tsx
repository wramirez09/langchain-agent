"use client";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { cn } from "@/utils/cn";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      className="toaster"
      expand={true}
      toastOptions={{
        classNames: {
          toast: cn("toast w-full max-w-sm toast-base text-white p-3 border-0"),
          title: "font-semibold text-white",
          description: "text-white/80 -mt-0.5 text-md",
          actionButton: cn(
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "px-3 py-1.5 text-md font-medium rounded-md",
          ),
          cancelButton: cn(
            "bg-muted text-muted-foreground hover:bg-accent/80",
            "px-3 py-1.5 text-md font-medium rounded-md",
          ),
          loading:
            "[--normal-bg:white] [--normal-border:transparent] [--normal-text:white] [--spinner-color:#fff] text-white bg-card",
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
