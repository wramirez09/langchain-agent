"use client";

import { useToast } from "@/utils/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props} className="w-full toast-base text-white sm:w-auto p-2 border-none">
            <div className="flex-1">
              {title && (
                <ToastTitle className="text-sm font-medium">
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className="mt-1 text-sm">
                  {description}
                </ToastDescription>
              )}
            </div>
            <div className="ml-4 flex items-center">
              {action}
              <ToastClose className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100" />
            </div>
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
