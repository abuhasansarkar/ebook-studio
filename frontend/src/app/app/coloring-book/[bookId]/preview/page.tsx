"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import { useColoringBook } from "@/lib/coloring-queries";

export default function ColoringBookPreviewPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading } = useColoringBook(bookId);

  // Spread index: 0 is Title/Blank spread, 1 is Page 1 illustration + Blank back, etc.
  const [spreadIndex, setSpreadIndex] = useState(0);

  if (isLoading) {
    return <PageLoader label="Loading book preview…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const pages = detail?.pages ?? [];
  const completed = pages.filter((p) => p.status === "completed" && p.asset);

  const totalSpreads = completed.length + 1; // 1 for title matter + 1 per illustration

  const prevSpread = () => setSpreadIndex((s) => Math.max(0, s - 1));
  const nextSpread = () => setSpreadIndex((s) => Math.min(totalSpreads - 1, s + 1));

  // If spreadIndex === 0: Left is Title Page, Right is Blank reverse
  // If spreadIndex > 0: Left is Blank back page, Right is Illustration (spreadIndex - 1)
  const currentIllustration = spreadIndex > 0 ? completed[spreadIndex - 1] : null;

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <h2 className="font-bold text-base">Physical Book Spread Preview</h2>
          <p className="text-xs text-muted-foreground">
            Simulates physical paperback layout with single-sided printing
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={prevSpread} disabled={spreadIndex === 0} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Previous Spread
          </Button>
          <span className="text-xs font-semibold font-mono text-muted-foreground">
            Spread {spreadIndex + 1} of {totalSpreads}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={nextSpread}
            disabled={spreadIndex === totalSpreads - 1}
            className="gap-1"
          >
            Next Spread <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Two-Page Spread Display */}
      <div className="mx-auto max-w-5xl rounded-3xl border border-border bg-neutral-900 p-6 sm:p-8 shadow-2xl">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 aspect-[4/3] w-full">
          {/* LEFT PAGE */}
          <div className="relative rounded-l-2xl border-r border-neutral-300 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-md overflow-hidden text-neutral-800">
            {spreadIndex === 0 ? (
              // Title Page
              <div className="flex flex-col justify-between h-full text-center">
                <div />
                <div>
                  <h1 className="text-2xl font-black text-black">{book?.title}</h1>
                  {book?.subtitle && <p className="mt-2 text-xs text-neutral-600">{book.subtitle}</p>}
                </div>
                <div className="text-[10px] text-neutral-400">
                  <p>Published with eBookStudio</p>
                  <p>© All rights reserved</p>
                </div>
              </div>
            ) : (
              // Blank Reverse Page (to prevent marker bleed-through)
              <div className="flex flex-col items-center justify-center h-full text-neutral-300 select-none">
                <div className="text-[11px] font-mono tracking-widest uppercase opacity-40">
                  [ Blank Page • Prevents Bleed-Through ]
                </div>
              </div>
            )}
            <span className="absolute bottom-2 left-4 text-[10px] text-neutral-400 font-mono">
              Page {spreadIndex === 0 ? "1" : (spreadIndex - 1) * 2 + 2}
            </span>
          </div>

          {/* RIGHT PAGE */}
          <div className="relative rounded-r-2xl border-l border-neutral-300 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-md overflow-hidden text-neutral-800">
            {spreadIndex === 0 ? (
              // Blank back of title page
              <div className="flex items-center justify-center h-full text-neutral-300 select-none">
                <span className="text-[10px] font-mono opacity-30">[ Intentionally Blank ]</span>
              </div>
            ) : currentIllustration && currentIllustration.asset ? (
              // Illustration Page
              <div className="flex flex-col items-center justify-center h-full">
                <img
                  src={`/api/v1/assets/${currentIllustration.asset.id}/view`}
                  alt={currentIllustration.title}
                  className="max-h-[85%] max-w-full object-contain"
                />
                <span className="mt-2 text-xs font-bold uppercase tracking-wider text-neutral-800">
                  {currentIllustration.caption || currentIllustration.title}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-400 text-xs">
                Page not generated yet
              </div>
            )}
            <span className="absolute bottom-2 right-4 text-[10px] text-neutral-400 font-mono">
              Page {spreadIndex === 0 ? "2" : (spreadIndex - 1) * 2 + 3}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
