"use client";

import Link from "next/link";
import { BookOpen, Plus, Sparkles, FilterX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function EbookEmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters?: boolean;
  onClearFilters?: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-12 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FilterX className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-foreground">No eBooks found</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          None of your ebooks match the selected filters or search term. Try widening your criteria.
        </p>
        {onClearFilters && (
          <Button variant="secondary" size="sm" onClick={onClearFilters} className="mt-5">
            Clear all filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-14 text-center shadow-sm">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <BookOpen className="h-8 w-8" />
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow">
          <Sparkles className="h-3 w-3" />
        </span>
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground">Your library is waiting</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground leading-relaxed">
        Describe any concept in one sentence and eBookStudio will plan chapters, write prose, and design a commercial-grade cover with OpenAI.
      </p>
      <Link href="/app/create" className={buttonVariants({ className: "mt-6 gap-2 font-semibold shadow-sm" })}>
        <Plus className="h-4 w-4" />
        Create your first eBook
      </Link>
    </div>
  );
}
