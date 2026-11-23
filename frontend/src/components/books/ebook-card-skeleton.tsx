"use client";

import { cn } from "@/lib/utils";

export function EbookCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface p-3.5 shadow-sm animate-pulse",
        className
      )}
    >
      {/* Cover Skeleton in portrait aspect ratio */}
      <div className="aspect-[1/1.55] w-full rounded-xl bg-muted" />

      {/* Title & Metadata Skeletons */}
      <div className="pt-3 space-y-2">
        <div className="h-4 w-4/5 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted/80" />
        <div className="flex items-center justify-between pt-2">
          <div className="h-5 w-16 rounded-full bg-muted" />
          <div className="h-3 w-14 rounded bg-muted" />
        </div>
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
          <div className="h-3 w-20 rounded bg-muted/60" />
          <div className="h-3 w-12 rounded bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

export function EbookGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <EbookCardSkeleton key={i} />
      ))}
    </div>
  );
}
