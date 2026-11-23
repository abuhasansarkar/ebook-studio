"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useColoringBook } from "@/lib/coloring-queries";
import { cn } from "@/lib/utils";
import { ColoringFlipBook, type FlipBookHandle } from "@/components/coloring/coloring-flip-book";

export default function ColoringBookPreviewPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isPending, error, refetch } = useColoringBook(bookId);

  const flipBookRef = useRef<FlipBookHandle>(null);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"flipbook" | "flat">("flipbook");
  const [mobilePageView, setMobilePageView] = useState<"right" | "left" | "spread">("right");

  if (isPending && !error) {
    return <PageLoader label="Loading book preview…" />;
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorState message={errorMessage(error) || "Coloring book not found"} onRetry={() => void refetch()} />
      </div>
    );
  }

  const book = detail.book;
  const pages = detail.pages ?? [];
  const completed = pages.filter((p) => p.status === "completed" && p.asset);

  const totalSpreads = completed.length + 1; // 1 for title matter + 1 per illustration

  const handlePrev = () => {
    if (viewMode === "flipbook") {
      flipBookRef.current?.flipPrev();
    } else {
      setSpreadIndex((s) => Math.max(0, s - 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "flipbook") {
      flipBookRef.current?.flipNext();
    } else {
      setSpreadIndex((s) => Math.min(totalSpreads - 1, s + 1));
    }
  };

  const currentIllustration = spreadIndex > 0 ? completed[spreadIndex - 1] : null;

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base sm:text-lg text-foreground">Physical Book Spread Preview</h2>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              KDP Single-Sided
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Simulates physical paperback layout with real page turning animation
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Mode Switcher Pills */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setViewMode("flipbook")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                viewMode === "flipbook"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>3D Flipbook</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                viewMode === "flat"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Flat Spread</span>
            </button>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrev}
              disabled={spreadIndex === 0}
              className="gap-1 shadow-xs cursor-pointer"
              title="Previous Page (←)"
            >
              <ChevronLeft className="h-4 w-4" /> <span className="hidden xs:inline">Previous</span>
            </Button>
            <span className="text-xs font-bold font-mono text-foreground whitespace-nowrap px-1.5">
              Spread {spreadIndex + 1} of {totalSpreads}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNext}
              disabled={spreadIndex === totalSpreads - 1}
              className="gap-1 shadow-xs cursor-pointer"
              title="Next Page (→)"
            >
              <span className="hidden xs:inline">Next</span> <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 3D FLIPBOOK VIEW MODE (Realistic physical page-turning animation) */}
      {viewMode === "flipbook" && (
        <div className="mx-auto max-w-5xl">
          <ColoringFlipBook
            ref={flipBookRef}
            book={book}
            completedPages={completed}
            currentSpread={spreadIndex}
            onSpreadChange={setSpreadIndex}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Click left/right pages or corners to flip • Touch swipe on mobile</span>
            </span>
            <span className="font-mono text-muted-foreground">Keyboard shortcuts: ← / → keys</span>
          </div>
        </div>
      )}

      {/* FLAT SPREAD VIEW MODE (Static fallback & mobile inspection) */}
      {viewMode === "flat" && (
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Mobile Page View Switcher (<sm) */}
          <div className="flex sm:hidden items-center justify-between gap-2 rounded-xl border border-border bg-surface p-1.5 text-xs font-medium">
            <span className="text-muted-foreground px-2">Page View:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobilePageView("left")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  mobilePageView === "left" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Left Page
              </button>
              <button
                type="button"
                onClick={() => setMobilePageView("right")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  mobilePageView === "right" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Right (Art)
              </button>
              <button
                type="button"
                onClick={() => setMobilePageView("spread")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  mobilePageView === "spread" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Spread
              </button>
            </div>
          </div>

          {/* Two-Page Spread Display */}
          <div className="rounded-[24px] sm:rounded-[36px] border-[10px] sm:border-[16px] border-[#161617] bg-[#161617] p-2.5 sm:p-5 shadow-2xl">
            <div
              className={cn(
                "w-full",
                mobilePageView === "spread"
                  ? "grid grid-cols-2 gap-0 aspect-[4/3]"
                  : "grid grid-cols-1 sm:grid-cols-2 gap-0 min-h-[420px] sm:aspect-[4/3]",
              )}
            >
              {/* LEFT PAGE */}
              <div
                className={cn(
                  "relative rounded-l-2xl border-y border-l border-neutral-300/80 border-r-[6px] border-[#161617] bg-[#fcfbf9] p-6 sm:p-10 flex flex-col justify-between shadow-xs overflow-hidden text-neutral-800",
                  mobilePageView === "right" ? "hidden sm:flex" : "flex",
                )}
              >
                {/* Spine Depth Shadow on Right edge */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 bg-gradient-to-l from-black/25 via-black/5 to-transparent z-10" />

                {spreadIndex === 0 ? (
                  // Title Page
                  <>
                    <div />
                    <div className="text-center px-4">
                      <h1 className="text-2xl sm:text-4xl font-black text-black tracking-tight leading-tight">
                        {book?.title || "Coloring Book"}
                      </h1>
                      {book?.subtitle && (
                        <p className="mt-3 text-xs sm:text-sm text-neutral-600 leading-relaxed font-medium">
                          {book.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="flex items-end justify-between text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
                      <span className="font-mono text-neutral-400">Page 1</span>
                      <div className="text-center font-sans leading-tight">
                        <p className="font-semibold text-neutral-600">Published with eBookStudio</p>
                        <p className="text-[10px]">© All rights reserved</p>
                      </div>
                      <span className="opacity-0 font-mono">Page 1</span>
                    </div>
                  </>
                ) : (
                  // Blank Reverse Page (to prevent marker bleed-through)
                  <>
                    <div />
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-xs sm:text-sm font-mono tracking-widest uppercase text-neutral-300 select-none">
                        [ Blank Page • Prevents Bleed-Through ]
                      </span>
                    </div>
                    <div className="flex items-end justify-between text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
                      <span className="font-mono text-neutral-400">Page {(spreadIndex - 1) * 2 + 3}</span>
                      <span className="text-[10px] font-mono text-neutral-400/80 uppercase tracking-wider">
                        Single-Sided Print
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* RIGHT PAGE */}
              <div
                className={cn(
                  "relative rounded-r-2xl border-y border-r border-neutral-300/80 border-l-[6px] border-[#161617] bg-[#fcfbf9] p-4 sm:p-6 flex flex-col justify-between shadow-xs overflow-hidden text-neutral-800",
                  mobilePageView === "left" ? "hidden sm:flex" : "flex",
                )}
              >
                {/* Spine Depth Shadow on Left edge */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-16 bg-gradient-to-r from-black/25 via-black/5 to-transparent z-10" />

                {spreadIndex === 0 ? (
                  // Blank back of title page
                  <>
                    <div />
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-xs sm:text-sm font-mono tracking-widest text-neutral-300 select-none">
                        [ Intentionally Blank ]
                      </span>
                    </div>
                    <div className="flex items-end justify-end text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
                      <span className="font-mono text-neutral-400">Page 2</span>
                    </div>
                  </>
                ) : currentIllustration && currentIllustration.asset ? (
                  // Illustration Page
                  <>
                    <div className="flex items-center justify-between border-b border-neutral-200/80 px-2 pb-2 text-[10px] font-mono text-neutral-400">
                      <span className="truncate font-semibold text-neutral-600 max-w-[65%]">{book?.title}</span>
                      <span>Plate #{spreadIndex}</span>
                    </div>
                    <div className="relative flex flex-1 items-center justify-center overflow-hidden my-auto p-2 sm:p-4">
                      <img
                        src={`/api/v1/assets/${currentIllustration.asset.id}/view`}
                        alt={currentIllustration.title}
                        className="max-h-[460px] w-auto max-w-full object-contain filter drop-shadow-md rounded-lg"
                      />
                    </div>
                    <div className="flex items-end justify-between border-t border-neutral-200/80 px-2 pt-2 text-neutral-400 text-[11px]">
                      <span className="font-semibold text-neutral-700 truncate max-w-[70%]">
                        {currentIllustration.caption || currentIllustration.title}
                      </span>
                      <span className="font-mono text-neutral-400">Page {(spreadIndex - 1) * 2 + 4}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-400 text-xs font-mono">
                    Page illustration not generated yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
