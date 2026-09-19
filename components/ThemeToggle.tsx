"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { cn } from "@/utils/cn";

/** `value` is what next-themes stores; `label` is what the user reads. */
const OPTIONS = [
  { value: "light", label: "Classic", Icon: Sun },
  { value: "dark", label: "Midnight", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Three-way theme control: the app's original palette, the NoteDoctor.AI
 * marketing palette, or whatever the OS asks for.
 *
 * next-themes resolves the stored value on the client, so the first server
 * render cannot know which option is active. Rendering the buttons unselected
 * until mount keeps the markup stable and avoids a hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-lg border border-border bg-muted p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              // min-h-9 keeps the touch target usable on phones, where this
              // control lives in the sidebar drawer.
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
