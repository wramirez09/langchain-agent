import React from "react";

/** Shimmer line. */
function Bar({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return (
    <div
      className="animate-pulse rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%]"
      style={{ width: w, height: h }}
    />
  );
}

/** A card-shaped placeholder for a section that hasn't streamed in yet. */
export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <Bar w="34%" h={10} />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Bar key={i} w={`${90 - i * 12}%`} />
        ))}
      </div>
    </div>
  );
}

/** Full placeholder shown before any JSON has parsed. */
export function ArtifactSkeleton() {
  return (
    <div className="space-y-3">
      <Bar w="60%" h={18} />
      <SectionSkeleton lines={3} />
      <SectionSkeleton lines={4} />
      <SectionSkeleton lines={2} />
    </div>
  );
}
