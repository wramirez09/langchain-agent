"use client";

import { Bookmark } from "lucide-react";
import { cn } from "@/utils/cn";
import { usePriorAuthUi } from "@/components/providers/PriorAuthProvider";

interface PriorAuthTabsProps {
  isLayoutSwapped: boolean;
  setIsLayoutSwapped: (v: boolean) => void;
}

export function PriorAuthTabs({ isLayoutSwapped, setIsLayoutSwapped }: PriorAuthTabsProps) {
  const { activeFormTab, setActiveFormTab, setSavedSheetOpen } = usePriorAuthUi();

  return (
    <div className="px-4 md:px-6 pt- pb-0 flex-shrink-0">
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex">
          {(["pre-auth", "chat", "output"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFormTab(tab)}
              className={cn(
                "md:hidden px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeFormTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground-soft",
              )}
            >
              {tab === "pre-auth" ? "Pre-Auth" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <button
            onClick={() => setActiveFormTab("input")}
            className={cn(
              "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeFormTab !== "output"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground-soft",
            )}
          >
            Input
          </button>
          <button
            onClick={() => setActiveFormTab("output")}
            className={cn(
              "hidden md:block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeFormTab === "output"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground-soft",
            )}
          >
            Output
          </button>
        </div>

        <div className="flex items-center gap-2 pb-3">
          <button
            onClick={() => setSavedSheetOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 mt-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent transition-all duration-200"
            title="Saved"
            aria-label="Saved"
          >
            <Bookmark size={16} strokeWidth={1.7} className="shrink-0 text-foreground-soft" />
            <span className="text-xs font-medium text-foreground-soft">Saved</span>
          </button>
          <button
            onClick={() => setIsLayoutSwapped(!isLayoutSwapped)}
            className="hidden md:flex items-center gap-2.5 px-3 py-1.5 mt-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent transition-all duration-200 group"
            title="Swap layout positions"
          >
            <span className={cn(
              "text-xs font-medium transition-colors duration-200",
              isLayoutSwapped ? "text-blue-600" : "text-foreground-soft"
            )}>
              Swap Layout
            </span>
            <div className={cn(
              "relative w-9 h-5 rounded-full transition-all duration-300",
              isLayoutSwapped ? "bg-blue-600" : "bg-border"
            )}>
              <div className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow-sm transition-transform duration-300",
                isLayoutSwapped && "translate-x-4"
              )} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
