"use client";

import { cn } from "@/utils/cn";
import { usePriorAuthUi } from "@/components/providers/PriorAuthProvider";

interface PriorAuthTabsProps {
  isLayoutSwapped: boolean;
  setIsLayoutSwapped: (v: boolean) => void;
}

export function PriorAuthTabs({ isLayoutSwapped, setIsLayoutSwapped }: PriorAuthTabsProps) {
  const { activeFormTab, setActiveFormTab } = usePriorAuthUi();

  return (
    <div className="px-4 md:px-6 pt- pb-0 flex-shrink-0">
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex">
          {(["pre-auth", "chat", "output"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFormTab(tab)}
              className={cn(
                "md:hidden px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeFormTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
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
                : "border-transparent text-gray-500 hover:text-gray-700",
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
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            Output
          </button>
        </div>

        <div className="hidden md:flex items-center pb-3">
          <button
            onClick={() => setIsLayoutSwapped(!isLayoutSwapped)}
            className="flex items-center gap-2.5 px-3 py-1.5 mt-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-all duration-200 group"
            title="Swap layout positions"
          >
            <span className={cn(
              "text-xs font-medium transition-colors duration-200",
              isLayoutSwapped ? "text-blue-600" : "text-gray-700"
            )}>
              Swap Layout
            </span>
            <div className={cn(
              "relative w-9 h-5 rounded-full transition-all duration-300",
              isLayoutSwapped ? "bg-blue-600" : "bg-gray-300"
            )}>
              <div className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300",
                isLayoutSwapped && "translate-x-4"
              )} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
