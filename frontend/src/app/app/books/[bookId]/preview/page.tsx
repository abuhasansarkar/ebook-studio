"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  FileText,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Palette,
  PenLine,
  Printer,
  RefreshCcw,
  Sparkles,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, ErrorState, PageLoader, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useChapter, useChapters, useExports } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EBookFlipBook, PageSurface, type FlipBookHandle } from "@/components/books/ebook-flip-book";
import {
  fetchExportPdf,
  fetchPrintSamplePdf,
  loadPdfDocument,
  renderAllPdfPages,
  type RenderedPageInfo,
} from "@/lib/pdf-service";
import type { ChapterFull } from "@/lib/types";
import { toast } from "sonner";

export default function EBookPreviewPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const bookQuery = useBook(bookId);
  const chaptersQuery = useChapters(bookId);
  const exportsQuery = useExports(bookId);

  const flipBookRef = useRef<FlipBookHandle>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const hasAutoLoadedRef = useRef(false);

  // View state
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [singlePageIndex, setSinglePageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"flipbook" | "flat" | "single">("flipbook");
  const [paperTone, setPaperTone] = useState<"cream" | "white" | "sepia">("cream");
  const [mobilePageView, setMobilePageView] = useState<"right" | "left" | "spread">("spread");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [showSpecs, setShowSpecs] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState("");

  // PDF rendering state
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [pdfRenderProgress, setPdfRenderProgress] = useState<{ current: number; total: number } | null>(null);
  const [pdfPages, setPdfPages] = useState<RenderedPageInfo[]>([]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{
    pageCount: number;
    sampleChapters: number;
    partial: boolean;
    source: "sample" | "export";
  } | null>(null);

  const book = bookQuery.data;
  const chapters = chaptersQuery.data ?? [];
  const exportsList = exportsQuery.data ?? [];
  const readyPdfExport = exportsList.find((e) => e.format === "pdf" && e.status === "ready");

  const isPdfActive = pdfPages.length > 0;
  const totalSpreads = isPdfActive
    ? Math.ceil(pdfPages.length / 2)
    : Math.max(3, chapters.length + 3);

  const totalPagesCount = isPdfActive ? pdfPages.length : totalSpreads * 2;

  // Active chapter based on current spread (for manuscript mode)
  const activeChapterIdx = spreadIndex >= 2 && spreadIndex < chapters.length + 2 ? spreadIndex - 2 : -1;
  const activeChapterId = activeChapterIdx >= 0 ? chapters[activeChapterIdx]?.id : null;
  const activeChapterQuery = useChapter(activeChapterId);

  const chapterDetailsMap: Record<string, ChapterFull> = {};
  if (activeChapterId && activeChapterQuery.data) {
    chapterDetailsMap[activeChapterId] = activeChapterQuery.data;
  }

  // Auto-scroll active thumbnail into view in filmstrip
  useEffect(() => {
    if (!filmstripRef.current) return;
    const targetIdx = viewMode === "single" ? singlePageIndex : spreadIndex;
    const selector = viewMode === "single" ? `[data-page="${targetIdx}"]` : `[data-spread="${targetIdx}"]`;
    const activeThumb = filmstripRef.current.querySelector(selector);
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [spreadIndex, singlePageIndex, viewMode]);

  // Sync singlePageIndex with spreadIndex when switching view modes
  const handleSwitchViewMode = (newMode: "flipbook" | "flat" | "single") => {
    if (newMode === "single" && viewMode !== "single") {
      setSinglePageIndex(spreadIndex * 2);
    } else if (newMode !== "single" && viewMode === "single") {
      setSpreadIndex(Math.min(totalSpreads - 1, Math.floor(singlePageIndex / 2)));
    }
    setViewMode(newMode);
  };

  // Fullscreen keyboard listener (F key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setIsFullscreen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handler to render the PDF via Chromium & PDF.js
  const handleRenderPdf = async (sourceExportId?: string, silent = false) => {
    setIsRenderingPdf(true);
    setPdfError(null);
    setPdfRenderProgress({ current: 0, total: 0 });

    try {
      let buffer: ArrayBuffer;
      let pageCount = 0;
      let sampleChapters = 0;
      let partial = false;
      let source: "sample" | "export" = "sample";

      if (sourceExportId) {
        source = "export";
        if (!silent) toast.info("Downloading exported PDF document…");
        buffer = await fetchExportPdf(sourceExportId);
      } else {
        if (!silent) toast.info("Rendering PDF sample via Chromium typesetting engine…");
        const sample = await fetchPrintSamplePdf(bookId);
        buffer = sample.buffer;
        pageCount = sample.pageCount;
        sampleChapters = sample.sampleChapters;
        partial = sample.partial;
      }

      // Create downloadable blob and revoke any previous object URL
      const blob = new Blob([buffer], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });

      // Load document with PDF.js in the browser
      const pdfDoc = await loadPdfDocument(buffer);
      const totalDocPages = pdfDoc.numPages;

      setPdfMeta({
        pageCount: totalDocPages,
        sampleChapters,
        partial,
        source,
      });

      // Render all pages to high-res data URLs
      const rendered = await renderAllPdfPages(pdfDoc, 1.8, (current, total) => {
        setPdfRenderProgress({ current, total });
      });

      setPdfPages(rendered);
      setSpreadIndex(0);
      setSinglePageIndex(0);
      if (!silent) toast.success(`Rendered ${rendered.length} PDF pages!`);
    } catch (err) {
      const msg = errorMessage(err);
      setPdfError(msg);
      if (!silent) toast.error(`PDF preview unavailable: ${msg}`);
    } finally {
      setIsRenderingPdf(false);
      setPdfRenderProgress(null);
    }
  };

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Automatically load or render PDF on page mount once exportsQuery has settled
  useEffect(() => {
    if (hasAutoLoadedRef.current || !book || exportsQuery.isPending) return;
    hasAutoLoadedRef.current = true;

    const exportId = readyPdfExport?.id;
    queueMicrotask(() => {
      void handleRenderPdf(exportId, true);
    });
  }, [book, exportsQuery.isPending, readyPdfExport?.id]);

  const handlePrev = () => {
    if (viewMode === "single") {
      setSinglePageIndex((p) => Math.max(0, p - 1));
    } else if (viewMode === "flipbook") {
      flipBookRef.current?.flipPrev();
    } else {
      setSpreadIndex((s) => Math.max(0, s - 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "single") {
      setSinglePageIndex((p) => Math.min(totalPagesCount - 1, p + 1));
    } else if (viewMode === "flipbook") {
      flipBookRef.current?.flipNext();
    } else {
      setSpreadIndex((s) => Math.min(totalSpreads - 1, s + 1));
    }
  };

  const handleJumpToSpread = (target: number) => {
    const clamped = Math.max(0, Math.min(totalSpreads - 1, target));
    if (viewMode === "flipbook") {
      flipBookRef.current?.flipToSpread(clamped);
    } else {
      setSpreadIndex(clamped);
    }
    setSinglePageIndex(clamped * 2);
  };

  const handleJumpToSinglePage = (pageIdx: number) => {
    const clamped = Math.max(0, Math.min(totalPagesCount - 1, pageIdx));
    setSinglePageIndex(clamped);
    setSpreadIndex(Math.min(totalSpreads - 1, Math.floor(clamped / 2)));
  };

  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageJumpInput.trim(), 10);
    if (!isNaN(pageNum) && pageNum >= 1) {
      const pageIdx = Math.min(totalPagesCount - 1, pageNum - 1);
      if (viewMode === "single") {
        handleJumpToSinglePage(pageIdx);
      } else {
        handleJumpToSpread(Math.floor(pageIdx / 2));
      }
      setPageJumpInput("");
    }
  };

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

  // Page numbers for current spread
  const leftPageNum = spreadIndex * 2 + 1;
  const rightPageNum = spreadIndex * 2 + 2;

  // Current spread descriptive label
  const currentSpreadLabel = isPdfActive
    ? viewMode === "single"
      ? `Page ${singlePageIndex + 1} of ${totalPagesCount}`
      : `Pages ${leftPageNum} – ${Math.min(rightPageNum, totalPagesCount)} of ${totalPagesCount}`
    : spreadIndex === 0
      ? "Front Cover & Title Page"
      : spreadIndex === 1
        ? "Copyright & Table of Contents"
        : spreadIndex === totalSpreads - 1
          ? "Author Bio & Colophon"
          : `Chapter ${activeChapterIdx + 1}: ${chapters[activeChapterIdx]?.title || "Chapter"}`;

  return (
    <div className={cn("space-y-5 transition-all", isFullscreen && "fixed inset-0 z-50 bg-background overflow-y-auto p-4 sm:p-6")}>
      {/* Ready PDF Export Banner if available */}
      {readyPdfExport && !isPdfActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
            </span>
            <div>
              <p className="font-bold text-foreground">
                Exported PDF Available ({readyPdfExport.pageCount ? `${readyPdfExport.pageCount} pages` : "Complete Book"})
              </p>
              <p className="text-muted-foreground text-[11px]">
                Load the full exported PDF to flip through every exact page.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleRenderPdf(readyPdfExport.id)}
              loading={isRenderingPdf}
              className="gap-1.5 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Layers className="h-3.5 w-3.5" /> Load Exported PDF
            </Button>
          </div>
        </div>
      )}

      {/* Top Header & Main Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-base sm:text-lg text-foreground">Physical Book Spread Preview</h2>
            {isPdfActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>PDF Print Engine ({pdfPages.length} Pages)</span>
              </span>
            ) : (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                Typeset Proof
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPdfActive
              ? `Displaying all ${pdfPages.length} book pages with real 3D page turning physics and authentic binding`
              : "Simulating physical book spread. Rendering PDF pages in background…"}
          </p>
        </div>

        {/* Action Buttons: Render PDF, Download, Fullscreen */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
          {/* Render PDF Button */}
          <Button
            size="sm"
            variant={isPdfActive ? "secondary" : "primary"}
            onClick={() => handleRenderPdf()}
            loading={isRenderingPdf}
            className="gap-1.5 shadow-xs cursor-pointer font-semibold"
            title="Render all PDF pages through Chromium typesetting engine"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isRenderingPdf && "animate-spin")} />
            <span>{isPdfActive ? "Re-render PDF" : "Render All PDF Pages"}</span>
          </Button>

          {/* Download PDF Button */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download={`${book.title || "book"}-print.pdf`}
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
                className: "gap-1.5 shadow-xs cursor-pointer text-xs font-semibold",
              })}
              title="Download rendered PDF file"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Download PDF</span>
            </a>
          )}

          {/* Fullscreen Toggle Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsFullscreen((v) => !v)}
            className="gap-1 shadow-xs cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Progress Bar during PDF Rendering */}
      {isRenderingPdf && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs font-semibold text-primary">
            <span className="flex items-center gap-2">
              <Spinner className="h-3.5 w-3.5" />
              <span>Rendering all book pages through high-precision Chromium engine…</span>
            </span>
            {pdfRenderProgress && pdfRenderProgress.total > 0 && (
              <span className="font-mono">
                Page {pdfRenderProgress.current} of {pdfRenderProgress.total}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width:
                  pdfRenderProgress && pdfRenderProgress.total > 0
                    ? `${(pdfRenderProgress.current / pdfRenderProgress.total) * 100}%`
                    : "45%",
              }}
            />
          </div>
        </div>
      )}

      {/* PDF Error Alert */}
      {pdfError && !isPdfActive && (
        <Alert tone="warning" className="text-xs">
          <p className="font-semibold">PDF sample rendering notice:</p>
          <p className="mt-0.5">{pdfError}</p>
          <p className="mt-1 text-muted-foreground">Showing the interactive manuscript proof below.</p>
        </Alert>
      )}

      {/* Secondary Controls Bar: Mode Switcher, Paper Tone, Zoom, Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5 sm:p-3 text-xs shadow-xs">
        {/* Left: View Mode Pills */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => handleSwitchViewMode("flipbook")}
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
            onClick={() => handleSwitchViewMode("flat")}
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
          <button
            type="button"
            onClick={() => handleSwitchViewMode("single")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              viewMode === "single"
                ? "bg-primary text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Single Page</span>
          </button>
        </div>

        {/* Center: Paper Tone & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Buttons */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.7, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoomLevel <= 0.7}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-12 text-center text-[11px] font-mono font-semibold tabular-nums text-foreground">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}
              disabled={zoomLevel >= 1.5}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Paper Tone Selector (cream, white, sepia) */}
          <div className="hidden lg:inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setPaperTone("cream")}
              className={cn(
                "rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer",
                paperTone === "cream" ? "bg-amber-100/90 text-amber-900 shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Cream
            </button>
            <button
              type="button"
              onClick={() => setPaperTone("white")}
              className={cn(
                "rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer",
                paperTone === "white" ? "bg-white text-neutral-900 shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              White
            </button>
            <button
              type="button"
              onClick={() => setPaperTone("sepia")}
              className={cn(
                "rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer",
                paperTone === "sepia" ? "bg-[#f4ebd9] text-[#423321] shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sepia
            </button>
          </div>

          {/* Toggle Filmstrip */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilmstrip((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{showFilmstrip ? "Hide Filmstrip" : "Show Filmstrip"}</span>
          </Button>
        </div>

        {/* Right: Spread Navigation & Direct Jump Box */}
        <div className="flex items-center gap-2">
          {/* Quick Page Jump Form */}
          <form onSubmit={handlePageJumpSubmit} className="hidden sm:flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalPagesCount}
              value={pageJumpInput}
              onChange={(e) => setPageJumpInput(e.target.value)}
              placeholder="Page #"
              className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-center text-xs font-mono text-foreground focus:border-primary focus:outline-none"
            />
            <Button type="submit" variant="secondary" size="sm" className="h-7 px-2 text-[11px]">
              Go
            </Button>
          </form>

          {/* Prev / Next Spread Buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrev}
              disabled={viewMode === "single" ? singlePageIndex === 0 : spreadIndex === 0}
              className="gap-1 shadow-xs cursor-pointer h-8"
              title="Previous Page (←)"
            >
              <ChevronLeft className="h-4 w-4" /> <span className="hidden xs:inline">Prev</span>
            </Button>
            <span className="text-xs font-bold font-mono text-foreground whitespace-nowrap px-1">
              {viewMode === "single" ? `${singlePageIndex + 1} / ${totalPagesCount}` : `${spreadIndex + 1} / ${totalSpreads}`}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNext}
              disabled={viewMode === "single" ? singlePageIndex === totalPagesCount - 1 : spreadIndex === totalSpreads - 1}
              className="gap-1 shadow-xs cursor-pointer h-8"
              title="Next Page (→)"
            >
              <span className="hidden xs:inline">Next</span> <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Preview Workspace (Scalable Container) */}
      <div
        className="mx-auto max-w-5xl transition-transform duration-200 origin-top"
        style={{
          transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : undefined,
          marginBottom: zoomLevel > 1 ? `${(zoomLevel - 1) * 350}px` : undefined,
        }}
      >
        {/* VIEW MODE 1: 3D FLIPBOOK SPREAD (Interactive physical page turns) */}
        {viewMode === "flipbook" && (
          <div>
            <EBookFlipBook
              ref={flipBookRef}
              book={book}
              chapters={chapters}
              currentSpread={spreadIndex}
              onSpreadChange={setSpreadIndex}
              chapterDetails={chapterDetailsMap}
              paperTone={paperTone}
              pdfPages={pdfPages}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Click left/right pages or corners to flip • Touch swipe on mobile</span>
              </span>
              <span className="font-mono text-muted-foreground">Shortcuts: ← / → keys • F: Fullscreen</span>
            </div>
          </div>
        )}

        {/* VIEW MODE 2: FLAT SPREAD (Side-by-side inspection) */}
        {viewMode === "flat" && (
          <div className="space-y-3">
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

            {/* Static Hardcover Casing Frame */}
            <div className="rounded-[24px] sm:rounded-[36px] border-[10px] sm:border-[16px] border-[#161617] bg-[#161617] p-2.5 sm:p-5 shadow-2xl">
              <div
                className={cn(
                  "w-full",
                  mobilePageView === "spread"
                    ? "grid grid-cols-2 gap-0 aspect-[4/3]"
                    : "grid grid-cols-1 sm:grid-cols-2 gap-0 min-h-[420px] sm:aspect-[4/3]",
                )}
              >
                {/* Left Page Surface */}
                <div
                  className={cn(
                    "w-full h-full",
                    mobilePageView === "right" ? "hidden sm:block" : "block",
                  )}
                >
                  <PageSurface
                    side="left"
                    book={book}
                    chapters={chapters}
                    spreadIndex={spreadIndex}
                    totalSpreads={totalSpreads}
                    chapterDetails={chapterDetailsMap}
                    paperTone={paperTone}
                    pdfPages={pdfPages}
                    onJumpToSpread={handleJumpToSpread}
                  />
                </div>

                {/* Right Page Surface */}
                <div
                  className={cn(
                    "w-full h-full",
                    mobilePageView === "left" ? "hidden sm:block" : "block",
                  )}
                >
                  <PageSurface
                    side="right"
                    book={book}
                    chapters={chapters}
                    spreadIndex={spreadIndex}
                    totalSpreads={totalSpreads}
                    chapterDetails={chapterDetailsMap}
                    paperTone={paperTone}
                    pdfPages={pdfPages}
                    onJumpToSpread={handleJumpToSpread}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 3: SINGLE PAGE (Zoomed Reading & Page Inspection) */}
        {viewMode === "single" && (
          <div className="mx-auto max-w-xl space-y-3">
            <div className="rounded-[24px] sm:rounded-[32px] border-[10px] sm:border-[16px] border-[#161617] bg-[#161617] p-3 sm:p-5 shadow-2xl">
              <div className="relative aspect-[3/4] min-h-[480px] w-full rounded-xl bg-[#fdfcf7] p-2 flex flex-col justify-between shadow-inner overflow-hidden">
                {isPdfActive && pdfPages[singlePageIndex] ? (
                  <div className="relative flex flex-1 w-full h-full items-center justify-center overflow-hidden my-auto">
                    <img
                      src={pdfPages[singlePageIndex].dataUrl}
                      alt={`Page ${pdfPages[singlePageIndex].pageNumber}`}
                      className="h-full w-full object-contain filter drop-shadow-md rounded-md select-none"
                    />
                  </div>
                ) : (
                  <div className="flex-1 w-full h-full">
                    <PageSurface
                      side={singlePageIndex % 2 === 0 ? "left" : "right"}
                      book={book}
                      chapters={chapters}
                      spreadIndex={Math.floor(singlePageIndex / 2)}
                      totalSpreads={totalSpreads}
                      chapterDetails={chapterDetailsMap}
                      paperTone={paperTone}
                      pdfPages={pdfPages}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-neutral-200/80 pt-1.5 px-2 text-[10px] font-mono text-neutral-500">
                  <span>Page {singlePageIndex + 1} of {totalPagesCount}</span>
                  <span>Single Page Focus</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ALL PAGES FILMSTRIP CAROUSEL (Interactive Bottom Thumbnail Strip) */}
      {showFilmstrip && (
        <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">All Book Pages</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {isPdfActive ? `${pdfPages.length} Pages` : `${totalSpreads} Spreads`}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">Click any page to jump immediately</span>
          </div>

          {/* Horizontal Scrollable Thumbnail Strip */}
          <div
            ref={filmstripRef}
            className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-muted-foreground/30"
          >
            {isPdfActive ? (
              // RENDERED REAL PDF PAGES THUMBNAILS
              pdfPages.map((page, idx) => {
                const spreadOfThisPage = Math.floor(idx / 2);
                const isCurrent = viewMode === "single" ? idx === singlePageIndex : spreadOfThisPage === spreadIndex;

                return (
                  <div
                    key={page.pageNumber}
                    data-spread={spreadOfThisPage}
                    data-page={idx}
                    onClick={() => {
                      if (viewMode === "single") {
                        handleJumpToSinglePage(idx);
                      } else {
                        handleJumpToSpread(spreadOfThisPage);
                      }
                    }}
                    className={cn(
                      "group relative flex-shrink-0 cursor-pointer rounded-xl border p-1 transition-all duration-200 bg-background",
                      isCurrent
                        ? "border-primary ring-2 ring-primary ring-offset-2 scale-105 shadow-md"
                        : "border-border hover:border-primary/50 hover:scale-102 opacity-80 hover:opacity-100",
                    )}
                  >
                    <div className="h-28 w-20 overflow-hidden rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200/60 shadow-2xs">
                      <img
                        src={page.dataUrl}
                        alt={`Page ${page.pageNumber}`}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between px-1 text-[9px] font-mono">
                      <span className={cn("font-bold", isCurrent ? "text-primary" : "text-muted-foreground")}>
                        P. {page.pageNumber}
                      </span>
                      {isCurrent && <Check className="h-3 w-3 text-primary stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            ) : (
              // MANUSCRIPT SPREAD THUMBNAILS
              Array.from({ length: totalSpreads }).map((_, sIdx) => {
                const isCurrent = sIdx === spreadIndex;
                const label =
                  sIdx === 0
                    ? "Title"
                    : sIdx === 1
                      ? "Contents"
                      : sIdx === totalSpreads - 1
                        ? "Colophon"
                        : `Ch ${sIdx - 1}`;

                return (
                  <div
                    key={sIdx}
                    data-spread={sIdx}
                    onClick={() => handleJumpToSpread(sIdx)}
                    className={cn(
                      "group relative flex-shrink-0 cursor-pointer rounded-xl border p-1.5 transition-all duration-200 bg-background",
                      isCurrent
                        ? "border-primary ring-2 ring-primary ring-offset-2 scale-105 shadow-md"
                        : "border-border hover:border-primary/50 hover:scale-102 opacity-80 hover:opacity-100",
                    )}
                  >
                    <div className="h-24 w-28 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2 flex flex-col justify-between border border-neutral-200/60 dark:border-neutral-700">
                      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                        <span>P. {sIdx * 2 + 1}</span>
                        <span>P. {sIdx * 2 + 2}</span>
                      </div>
                      <div className="text-center font-serif text-[11px] font-bold text-foreground truncate px-1">
                        {label}
                      </div>
                      <div className="h-0.5 w-6 bg-primary/40 mx-auto" />
                    </div>
                    <div className="mt-1 text-center text-[10px] font-semibold text-muted-foreground">
                      Spread {sIdx + 1}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Book Specifications & Diagnostics Collapsible */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowSpecs((v) => !v)}>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Print Specifications & Layout Diagnostics</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            {showSpecs ? "Hide Details" : "Show Details"}
          </Button>
        </div>

        {showSpecs && (
          <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <span className="text-[10px] text-muted-foreground font-mono uppercase block mb-1">Trim Dimensions</span>
              <p className="font-bold text-foreground">6.0&quot; × 9.0&quot;</p>
              <p className="text-[11px] text-muted-foreground">Standard Trade Paperback</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <span className="text-[10px] text-muted-foreground font-mono uppercase block mb-1">Book Length</span>
              <p className="font-bold text-foreground">{totalPagesCount} Pages</p>
              <p className="text-[11px] text-muted-foreground">{chapters.length} Total Chapters</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <span className="text-[10px] text-muted-foreground font-mono uppercase block mb-1">Binding Simulation</span>
              <p className="font-bold text-foreground">12px Spine Groove</p>
              <p className="text-[11px] text-muted-foreground">Case-bound Hardcover</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <span className="text-[10px] text-muted-foreground font-mono uppercase block mb-1">Preflight Engine</span>
              <p className="font-bold text-emerald-600 dark:text-emerald-400">PDF/X-1a Ready</p>
              <p className="text-[11px] text-muted-foreground">Chromium HarfBuzz</p>
            </div>
          </div>
        )}
      </div>

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
