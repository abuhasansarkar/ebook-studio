"use client";

import { use } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Image as ImageIcon,
  Layers,
  Palette,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import { useColoringBook, useColoringCover } from "@/lib/coloring-queries";

export default function ColoringBookCoverPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading: loadingBook } = useColoringBook(bookId);
  const { data: coverData, isLoading: loadingCover } = useColoringCover(bookId);

  if (loadingBook || loadingCover) {
    return <PageLoader label="Loading cover studio…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const spine = coverData?.spine;
  const thumbnails = coverData?.sampleThumbnails ?? [];

  return (
    <div className="space-y-8">
      {/* Spine & Spec Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <h2 className="font-bold text-base">Paperback Wrap-Around Cover Specs</h2>
          <p className="text-xs text-muted-foreground">
            Calculated according to Amazon KDP Paperback cover requirements
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Total Physical Pages: </span>
            <span className="font-bold text-foreground">{spine?.totalPhysicalPages} pages</span>
          </div>
          <div>
            <span className="text-muted-foreground">Spine Width: </span>
            <span className="font-bold text-foreground font-mono">
              {spine?.spineThicknessInches} in ({spine?.spineThicknessMm} mm)
            </span>
          </div>
        </div>
      </div>

      {/* Visual Wrap Cover Preview (Back - Spine - Front) */}
      <Card className="p-6 bg-muted/20 overflow-x-auto">
        <div className="min-w-[700px] flex items-stretch justify-center rounded-2xl border border-border bg-neutral-900 shadow-2xl p-4 text-white">
          {/* Back Cover (Left) */}
          <div className="flex-1 bg-gradient-to-br from-indigo-950 to-slate-900 p-6 rounded-l-xl flex flex-col justify-between border-r border-indigo-900/50">
            <div>
              <Badge tone="primary" className="text-[10px]">
                Back Cover
              </Badge>
              <h3 className="mt-3 font-bold text-base">{book?.title}</h3>
              <p className="mt-1 text-xs text-indigo-200/80 leading-relaxed">
                Enjoy {plan?.pageCount} relaxing coloring illustrations designed for {plan?.targetAudience}.
                Single-sided printing prevents marker bleed-through so you can frame your artwork!
              </p>

              {/* Sample Interior Thumbnails */}
              <div className="mt-4">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                  Inside This Book:
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {thumbnails.slice(0, 3).map((thumb) => (
                    <div
                      key={thumb.pageNumber}
                      className="aspect-[3/4] bg-white rounded-lg p-1 border border-white/20 shadow-sm flex items-center justify-center overflow-hidden"
                    >
                      {thumb.assetId ? (
                        <img
                          src={`/api/v1/assets/${thumb.assetId}/view`}
                          alt={thumb.title}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-[9px] text-black">Page {thumb.pageNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* KDP Barcode Zone */}
            <div className="mt-6 self-end border border-dashed border-white/40 bg-white/10 px-3 py-2 rounded text-[10px] text-center w-28">
              <span className="font-mono text-[9px] text-indigo-200">KDP Barcode Area (2.0" × 1.2")</span>
            </div>
          </div>

          {/* Spine (Center) */}
          <div className="w-10 bg-indigo-950 flex flex-col items-center justify-center border-x border-indigo-900/80 py-4 select-none">
            {spine?.meetsKdpSpineTextThreshold ? (
              <span
                className="rotate-90 text-[10px] font-bold text-indigo-200 whitespace-nowrap tracking-wider uppercase"
                style={{ transformOrigin: "center" }}
              >
                {book?.title}
              </span>
            ) : (
              <span className="text-[9px] text-indigo-400/60 rotate-90 whitespace-nowrap">No text (&lt;79p)</span>
            )}
          </div>

          {/* Front Cover (Right) */}
          <div className="flex-1 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 p-8 rounded-r-xl flex flex-col justify-between text-center relative overflow-hidden">
            <div>
              <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-semibold text-white tracking-widest uppercase">
                {plan?.artStyle ? plan.artStyle.replace(/_/g, " ") : "Coloring Book"}
              </span>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white drop-shadow-md">
                {book?.title}
              </h1>
              {book?.subtitle && <p className="mt-1 text-xs text-indigo-200 font-medium">{book.subtitle}</p>}
            </div>

            {/* Front Cover Central Illustration Placeholder / Graphic */}
            <div className="my-6 mx-auto h-36 w-36 rounded-2xl border-2 border-white/30 bg-white/10 flex items-center justify-center shadow-lg">
              <Sparkles className="h-14 w-14 text-indigo-300 animate-pulse" />
            </div>

            <div>
              <span className="text-xs text-indigo-200 font-semibold">{plan?.pageCount} Relaxing Coloring Pages</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
