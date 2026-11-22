"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  Image as ImageIcon,
  Layers,
  Palette,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import {
  useColoringBook,
  useColoringCover,
  useGenerateColoringCover,
} from "@/lib/coloring-queries";
import { useCredits } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export default function ColoringBookCoverPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isPending: pendingBook, error: bookError, refetch: refetchBook } = useColoringBook(bookId);
  const { data: coverData, isPending: pendingCover, error: coverError, refetch: refetchCover } = useColoringCover(bookId);
  const generateCover = useGenerateColoringCover(bookId);
  const credits = useCredits();

  const [promptOverride, setPromptOverride] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [subtitleOverride, setSubtitleOverride] = useState("");
  const [authorOverride, setAuthorOverride] = useState("");

  if ((pendingBook || pendingCover) && !bookError && !coverError) {
    return <PageLoader label="Loading cover studio…" />;
  }

  if (bookError || coverError || !detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorState
          message={errorMessage(bookError || coverError) || "Coloring book cover details not found"}
          onRetry={() => {
            void refetchBook();
            void refetchCover();
          }}
        />
      </div>
    );
  }

  const book = detail.book;
  const plan = detail.plan;
  const spine = coverData?.spine;
  const thumbnails = coverData?.sampleThumbnails ?? [];
  const artworkAsset = coverData?.coverArtworkAsset;

  const currentTitle = titleOverride || book?.title || "My Coloring Book";
  const currentSubtitle = subtitleOverride !== "" ? subtitleOverride : (book?.subtitle || "");
  const currentAuthor = authorOverride;

  const handleGenerateCover = async () => {
    const currentBalance = credits.data?.wallet?.balance ?? 0;
    if (currentBalance < 10) {
      toast.error(`You need 10 credits to generate cover artwork, but only have ${currentBalance}.`);
      return;
    }

    try {
      toast.loading("Generating full-color commercial cover artwork… (10 credits)");
      await generateCover.mutateAsync({
        promptOverride: promptOverride.trim() || undefined,
        titleOverride: titleOverride.trim() || undefined,
        subtitleOverride: subtitleOverride.trim() || undefined,
        authorOverride: authorOverride.trim() || undefined,
      });
      toast.dismiss();
      toast.success("Cover artwork generated successfully!");
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Failed to generate cover artwork");
    }
  };

  return (
    <div className="space-y-8">
      {/* Spine & Spec Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div>
          <h2 className="font-bold text-base">Paperback Wrap-Around Cover Specs</h2>
          <p className="text-xs text-muted-foreground">
            Calculated according to Amazon KDP Paperback cover requirements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
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
          <div>
            <span className="text-muted-foreground">Spine Text: </span>
            <span className="font-semibold text-foreground">
              {spine?.meetsKdpSpineTextThreshold ? (
                <span className="text-emerald-500">Allowed (≥79p)</span>
              ) : (
                <span className="text-muted-foreground">Blank (&lt;79p)</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Wrap Cover Preview (Back - Spine - Front) */}
      <Card className="p-6 bg-muted/20 overflow-x-auto">
        <div className="min-w-[760px] flex items-stretch justify-center rounded-2xl border border-border bg-neutral-900 shadow-2xl p-4 text-white">
          {/* Back Cover (Left) */}
          <div className="flex-1 bg-gradient-to-br from-indigo-950 to-slate-900 p-6 rounded-l-xl flex flex-col justify-between border-r border-indigo-900/50">
            <div>
              <div className="flex items-center justify-between">
                <Badge tone="primary" className="text-[10px]">
                  Back Cover
                </Badge>
                <span className="text-[10px] text-indigo-300 font-mono">KDP Ready</span>
              </div>
              <h3 className="mt-3 font-bold text-base">{currentTitle}</h3>
              <p className="mt-1 text-xs text-indigo-200/80 leading-relaxed">
                Enjoy {plan?.pageCount} relaxing coloring illustrations designed for {plan?.targetAudience}.
                Single-sided printing prevents marker bleed-through so you can frame your artwork!
              </p>

              {/* Sample Interior Thumbnails */}
              <div className="mt-5">
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
            <div className="mt-6 self-end border border-dashed border-white/40 bg-white/10 px-3 py-2 rounded text-[10px] text-center w-32">
              <span className="font-mono text-[9px] text-indigo-200">KDP Barcode Safe Zone (2.0&quot; × 1.2&quot;)</span>
            </div>
          </div>

          {/* Spine (Center) */}
          <div className="w-12 bg-indigo-950 flex flex-col items-center justify-center border-x border-indigo-900/80 py-4 select-none">
            {spine?.meetsKdpSpineTextThreshold ? (
              <span
                className="rotate-90 text-[10px] font-bold text-indigo-200 whitespace-nowrap tracking-wider uppercase"
                style={{ transformOrigin: "center" }}
              >
                {currentTitle}
              </span>
            ) : (
              <span className="text-[9px] text-indigo-400/60 rotate-90 whitespace-nowrap">No text (&lt;79p)</span>
            )}
          </div>

          {/* Front Cover (Right) */}
          <div className="flex-1 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 p-8 rounded-r-xl flex flex-col justify-between text-center relative overflow-hidden">
            {/* Background artwork if generated */}
            {artworkAsset && (
              <img
                src={`/api/v1/assets/${artworkAsset.id}/view`}
                alt="Front Cover Art"
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
            )}
            <div className="relative z-10 bg-black/35 backdrop-blur-[2px] p-4 rounded-2xl border border-white/10">
              <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-semibold text-white tracking-widest uppercase">
                {plan?.artStyle ? plan.artStyle.replace(/_/g, " ") : "Coloring Book"}
              </span>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white drop-shadow-md">
                {currentTitle}
              </h1>
              {currentSubtitle && <p className="mt-1 text-xs text-indigo-200 font-medium">{currentSubtitle}</p>}
            </div>

            {!artworkAsset && (
              <div className="relative z-10 my-6 mx-auto h-36 w-36 rounded-2xl border-2 border-white/30 bg-white/10 flex flex-col items-center justify-center shadow-lg">
                <Sparkles className="h-10 w-10 text-indigo-300 animate-pulse mb-1" />
                <span className="text-[10px] text-indigo-200 font-medium">Cover Art Ready to Generate</span>
              </div>
            )}

            <div className="relative z-10 bg-black/35 backdrop-blur-[2px] py-2 px-4 rounded-xl border border-white/10 inline-block mx-auto">
              {currentAuthor ? (
                <span className="text-xs text-white font-semibold block">By {currentAuthor}</span>
              ) : null}
              <span className="text-[11px] text-indigo-200 font-semibold">{plan?.pageCount} Relaxing Coloring Pages</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Cover Generator & Customization Controls */}
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h3 className="font-bold text-lg">Cover Studio Controls</h3>
            <p className="text-xs text-muted-foreground">
              Generate commercial full-color artwork and customize title typography for KDP paperback publishing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Credits: <strong className="text-foreground">{credits.data ? formatNumber(credits.data.wallet.balance) : "—"}</strong>
            </span>
            <Button
              onClick={handleGenerateCover}
              loading={generateCover.isPending}
              size="lg"
              className="gap-2 shadow-md"
            >
              <Sparkles className="h-4 w-4" /> {artworkAsset ? "Regenerate Cover (10 cr)" : "Generate Full-Color Cover (10 cr)"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Front Cover Title</label>
              <input
                type="text"
                defaultValue={book?.title}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="Book title"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Subtitle / Catchphrase</label>
              <input
                type="text"
                defaultValue={book?.subtitle || ""}
                onChange={(e) => setSubtitleOverride(e.target.value)}
                placeholder="e.g. 24 Cute Coloring Pages for Kids"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Author Name</label>
              <input
                type="text"
                defaultValue={authorOverride}
                onChange={(e) => setAuthorOverride(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Custom Cover Art Prompt Directive (Optional)
              </label>
              <textarea
                value={promptOverride}
                onChange={(e) => setPromptOverride(e.target.value)}
                rows={5}
                placeholder={`Leave blank to use smart defaults based on "${plan?.topic}" in ${plan?.artStyle?.replace(/_/g, " ")} style, or customize specific elements (e.g. "Add a friendly baby cow wearing a floral crown in a meadow of sunflowers").`}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono"
              />
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary-soft/10 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Pro-Tip:</span> Bestselling Amazon KDP covers feature
              high-saturation colors, cheerful character expressions, and clean contrast with the title text.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
