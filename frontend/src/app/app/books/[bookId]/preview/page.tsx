"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Layers,
  Palette,
  PenLine,
  Sparkles,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useChapter, useChapters } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EBookFlipBook, type FlipBookHandle } from "@/components/books/ebook-flip-book";
import type { ChapterFull } from "@/lib/types";

export default function EBookPreviewPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const bookQuery = useBook(bookId);
  const chaptersQuery = useChapters(bookId);

  const flipBookRef = useRef<FlipBookHandle>(null);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"flipbook" | "flat">("flipbook");
  const [paperTone, setPaperTone] = useState<"cream" | "white" | "sepia">("cream");
  const [mobilePageView, setMobilePageView] = useState<"right" | "left" | "spread">("right");

  const book = bookQuery.data;
  const chapters = chaptersQuery.data ?? [];

  // Total spreads:
  // Spread 0: Cover / Half-Title + Title Page
  // Spread 1: Matter + Table of Contents
  // Spread 2.. (1 + chapters.length): Chapters
  // Spread (2 + chapters.length): Back Matter & Colophon
  const totalSpreads = Math.max(3, chapters.length + 3);

  // Active chapter based on current spread
  const activeChapterIdx = spreadIndex >= 2 && spreadIndex < chapters.length + 2 ? spreadIndex - 2 : -1;
  const activeChapterId = activeChapterIdx >= 0 ? chapters[activeChapterIdx]?.id : null;
  const activeChapterQuery = useChapter(activeChapterId);

  // Cache loaded chapter details for instant rendering during flips
  const chapterDetailsMap: Record<string, ChapterFull> = {};
  if (activeChapterId && activeChapterQuery.data) {
    chapterDetailsMap[activeChapterId] = activeChapterQuery.data;
  }

  if ((bookQuery.isPending && !bookQuery.error) || (chaptersQuery.isPending && !chaptersQuery.error)) {
    return <PageLoader label="Loading book preview…" />;
  }

  if (bookQuery.error || chaptersQuery.error || !book) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorState
          message={errorMessage(bookQuery.error ?? chaptersQuery.error) || "Book not found"}
          onRetry={() => {
            void bookQuery.refetch();
            void chaptersQuery.refetch();
          }}
        />
      </div>
    );
  }

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

  const handleJumpToSpread = (target: number) => {
    if (viewMode === "flipbook") {
      flipBookRef.current?.flipToSpread(target);
    } else {
      setSpreadIndex(target);
    }
  };

  // Determine label for current spread
  const currentSpreadLabel =
    spreadIndex === 0
      ? "Front Cover & Title Page"
      : spreadIndex === 1
        ? "Copyright & Table of Contents"
        : spreadIndex === totalSpreads - 1
          ? "Author Bio & Colophon"
          : `Chapter ${activeChapterIdx + 1}: ${chapters[activeChapterIdx]?.title || "Chapter"}`;

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base sm:text-lg text-foreground">Physical Book Spread Preview</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              Hardcover & Paperback
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Simulates physical book layout with real page turning animation
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Paper Tone Pills */}
          <div className="hidden md:inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 text-xs">
            <span className="text-[11px] text-muted-foreground px-1.5 font-medium">Paper:</span>
            <button
              type="button"
              onClick={() => setPaperTone("cream")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                paperTone === "cream" ? "bg-amber-100/90 text-amber-900 shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Cream
            </button>
            <button
              type="button"
              onClick={() => setPaperTone("white")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                paperTone === "white" ? "bg-white text-neutral-900 shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              White
            </button>
            <button
              type="button"
              onClick={() => setPaperTone("sepia")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                paperTone === "sepia" ? "bg-[#f4ebd9] text-[#423321] shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sepia
            </button>
          </div>

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

      {/* Spread Quick Jumper Strip */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-muted-foreground shrink-0">Current:</span>
          <span className="truncate font-medium text-foreground">{currentSpreadLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleJumpToSpread(0)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              spreadIndex === 0 ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Title
          </button>
          <button
            type="button"
            onClick={() => handleJumpToSpread(1)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              spreadIndex === 1 ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Contents
          </button>
          {chapters.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleJumpToSpread(i + 2)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                spreadIndex === i + 2 ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-foreground",
              )}
              title={c.title}
            >
              Ch {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleJumpToSpread(totalSpreads - 1)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              spreadIndex === totalSpreads - 1 ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            End
          </button>
        </div>
      </div>

      {/* 3D FLIPBOOK VIEW MODE (Realistic physical page-turning animation) */}
      {viewMode === "flipbook" && (
        <div className="mx-auto max-w-5xl">
          <EBookFlipBook
            ref={flipBookRef}
            book={book}
            chapters={chapters}
            currentSpread={spreadIndex}
            onSpreadChange={setSpreadIndex}
            chapterDetails={chapterDetailsMap}
            paperTone={paperTone}
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
                Right Page
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

          {/* Static Two-Page Spread Display */}
          <div className="rounded-[24px] sm:rounded-[36px] border-[10px] sm:border-[16px] border-[#161617] bg-[#161617] p-2.5 sm:p-5 shadow-2xl">
            <div
              className={cn(
                "w-full",
                mobilePageView === "spread"
                  ? "grid grid-cols-2 gap-0 aspect-[4/3]"
                  : "grid grid-cols-1 sm:grid-cols-2 gap-0 min-h-[420px] sm:aspect-[4/3]",
              )}
            >
              <div
                className={cn(
                  "w-full h-full",
                  mobilePageView === "right" ? "hidden sm:block" : "block",
                )}
              >
                <EBookFlipBook
                  book={book}
                  chapters={chapters}
                  currentSpread={spreadIndex}
                  onSpreadChange={setSpreadIndex}
                  chapterDetails={chapterDetailsMap}
                  paperTone={paperTone}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Jump Action Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <Link
          href={`/app/books/${bookId}/editor`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 hover:bg-muted/30 transition-all shadow-xs group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
            <PenLine className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Edit Manuscript</p>
            <p className="text-[11px] text-muted-foreground">Add or modify chapter content</p>
          </div>
        </Link>

        <Link
          href={`/app/books/${bookId}/design`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 hover:bg-muted/30 transition-all shadow-xs group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:scale-105 transition-transform">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Interior Styling</p>
            <p className="text-[11px] text-muted-foreground">Adjust fonts, margins & layout</p>
          </div>
        </Link>

        <Link
          href={`/app/books/${bookId}/export`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 hover:bg-muted/30 transition-all shadow-xs group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
            <FileDown className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Export Book</p>
            <p className="text-[11px] text-muted-foreground">Generate PDF, EPUB, and Print files</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
