"use client";

import {
  Bookmark,
  ClipboardPen,
  FileCheck2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { usePriorAuthUi } from "@/components/providers/PriorAuthProvider";

// Phone/tablet tabs. Values are the provider's tab keys; labels and icons are
// what users see. Request and Report carry the same names on desktop.
const MOBILE_TABS: {
  value: "pre-auth" | "chat" | "output";
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "pre-auth", label: "Request", icon: ClipboardPen },
  { value: "chat", label: "Ai Assistant", icon: Sparkles },
  { value: "output", label: "Report", icon: FileCheck2 },
];

const tabClass = (active: boolean) =>
  cn(
    "flex items-center gap-1.5 whitespace-nowrap py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
    active
      ? "border-blue-600 text-blue-600"
      : "border-transparent text-muted-foreground hover:text-foreground-soft",
  );

interface PriorAuthTabsProps {
  isLayoutSwapped: boolean;
  setIsLayoutSwapped: (v: boolean) => void;
}

export function PriorAuthTabs({
  isLayoutSwapped,
  setIsLayoutSwapped,
}: PriorAuthTabsProps) {
  const { activeFormTab, setActiveFormTab, setSavedSheetOpen } =
    usePriorAuthUi();

  return (
    <div className="px-4 md:px-6 pt- pb-0 flex-shrink-0">
      <div className="flex items-center justify-between border-b border-border">
        {/* min-w-0 + horizontal scroll: if the narrowest phones can't fit all
            three tabs beside Saved, the row scrolls rather than wrapping. */}
        <div className="hide-scrollbar flex min-w-0 overflow-x-auto">
          {MOBILE_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setActiveFormTab(value)}
              // Visibility last: tabClass sets `flex`, and cn() lets the later
              // of two display classes win.
              className={cn(
                tabClass(activeFormTab === value),
                "px-2.5 md:hidden",
              )}
            >
              <Icon
                size={16}
                strokeWidth={1.7}
                aria-hidden="true"
                className="shrink-0"
              />
              {label}
            </button>
          ))}
          <button
            onClick={() => setActiveFormTab("input")}
            className={cn(
              tabClass(activeFormTab !== "output"),
              "hidden px-4 md:flex",
            )}
          >
            <ClipboardPen
              size={16}
              strokeWidth={1.7}
              aria-hidden="true"
              className="shrink-0"
            />
            Request
          </button>
          <button
            onClick={() => setActiveFormTab("output")}
            className={cn(
              tabClass(activeFormTab === "output"),
              "hidden px-4 md:flex",
            )}
          >
            <FileCheck2
              size={16}
              strokeWidth={1.7}
              aria-hidden="true"
              className="shrink-0"
            />
            Report
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 pb-3">
          <button
            onClick={() => setSavedSheetOpen(true)}
            className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 mt-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent transition-all duration-200"
            title="Saved"
            aria-label="Saved"
          >
            <Bookmark
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-foreground-soft"
            />
            {/* Icon-only below desktop so the tabs fit; aria-label keeps the name. */}
            <span className="hidden md:inline text-xs font-medium text-foreground-soft">
              Saved
            </span>
          </button>
          <button
            onClick={() => setIsLayoutSwapped(!isLayoutSwapped)}
            className="hidden md:flex items-center gap-2.5 px-3 py-1.5 mt-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent transition-all duration-200 group"
            title="Swap layout positions"
          >
            <span
              className={cn(
                "text-xs font-medium transition-colors duration-200",
                isLayoutSwapped ? "text-blue-600" : "text-foreground-soft",
              )}
            >
              Swap Layout
            </span>
            <div
              className={cn(
                "relative w-9 h-5 rounded-full transition-all duration-300",
                isLayoutSwapped ? "bg-blue-600" : "bg-border",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform duration-300",
                  isLayoutSwapped && "translate-x-4",
                )}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
