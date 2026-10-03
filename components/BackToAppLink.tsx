import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/utils/cn";

/** Returns to the main dashboard (`/agents`) from the API pages. */
export function BackToAppLink({ className }: { className?: string }) {
  return (
    <Link
      href="/agents"
      className={cn(
        "-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary transition-colors hover:bg-accent dark:text-accent-foreground",
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back to app
    </Link>
  );
}
