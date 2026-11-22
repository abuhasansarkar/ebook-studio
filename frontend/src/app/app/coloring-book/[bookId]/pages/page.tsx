"use client";

import { use, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Filter,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import {
  useColoringBook,
  useGenerateBatchColoring,
  useGenerateColoringPage,
  type ColoringPageRecord,
} from "@/lib/coloring-queries";
import { useCredits } from "@/lib/queries";
import { cn, formatNumber } from "@/lib/utils";

export default function ColoringBookPagesPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading } = useColoringBook(bookId);
  const credits = useCredits();

  const generatePage = useGenerateColoringPage(bookId);
  const generateBatch = useGenerateBatchColoring(bookId);

  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [regenPage, setRegenPage] = useState<ColoringPageRecord | null>(null);
  const [regenPromptTweak, setRegenPromptTweak] = useState("");
  const [previewPage, setPreviewPage] = useState<ColoringPageRecord | null>(null);

  if (isLoading) {
    return <PageLoader label="Loading coloring pages…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const pages = detail?.pages ?? [];
  const stats = detail?.stats;

  const pendingPages = pages.filter((p) => p.status === "pending" || p.status === "failed");
  const pendingCount = pendingPages.length;
  const batchCredits = pendingCount * 8;

  const filteredPages = pages.filter((p) => {
    if (filter === "completed") return p.status === "completed";
    if (filter === "pending") return p.status === "pending" || p.status === "generating";
    if (filter === "failed") return p.status === "failed";
    return true;
  });

  const handleOpenRegenModal = (page: ColoringPageRecord) => {
    setRegenPage(page);
    setRegenPromptTweak(page.prompt);
  };

  const handleConfirmRegenerate = async () => {
    if (!regenPage) return;
    try {
      toast.loading(`Regenerating Page ${regenPage.pageNumber}… (8 credits)`);
      await generatePage.mutateAsync({
        pageId: regenPage.id,
        promptOverride: regenPromptTweak,
      });
      toast.dismiss();
      toast.success(`Page ${regenPage.pageNumber} regenerated!`);
      setRegenPage(null);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Regeneration failed");
    }
  };

  const handleGenerateBatch = async () => {
    if (pendingCount === 0) {
      toast.info("All pages are already generated!");
      return;
    }
    const currentBalance = credits.data?.wallet?.balance ?? 0;
    if (currentBalance < batchCredits) {
      toast.error(`You need ${batchCredits} credits to generate all pages, but only have ${currentBalance}.`);
      return;
    }

    try {
      toast.loading(`Generating remaining ${pendingCount} pages in queue…`);
      const res = await generateBatch.mutateAsync();
      toast.dismiss();
      toast.success(`Batch generation finished! ${res.completed} pages completed.`);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Batch generation failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "completed", "pending", "failed"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                filter === mode
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {mode} {mode === "all" ? `(${pages.length})` : mode === "completed" ? `(${stats?.completed})` : mode === "pending" ? `(${stats?.pending})` : `(${stats?.failed})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="text-muted-foreground">Credits: </span>
            <span className="font-bold text-foreground">
              {credits.data ? formatNumber(credits.data.wallet.balance) : "—"}
            </span>
          </div>

          {pendingCount > 0 && (
            <Button
              onClick={handleGenerateBatch}
              loading={generateBatch.isPending}
              size="sm"
              className="gap-1.5 shadow-md"
            >
              <Zap className="h-4 w-4" /> Generate All Remaining ({batchCredits} cr)
            </Button>
          )}
        </div>
      </div>

      {/* Pages Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredPages.map((page) => {
          const isDone = page.status === "completed" && page.asset;
          const isGenerating = page.status === "generating";
          const isFailed = page.status === "failed";
          const assetUrl = page.asset ? `/api/v1/assets/${page.asset.id}/view` : null;

          return (
            <Card
              key={page.id}
              className="group flex flex-col justify-between overflow-hidden p-4 transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between pb-3">
                  <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                    Page {page.pageNumber}
                  </span>
                  {isDone && (
                    <Badge tone="success" className="gap-1 text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </Badge>
                  )}
                  {isGenerating && (
                    <Badge tone="primary" className="gap-1 text-[10px] animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" /> Drawing…
                    </Badge>
                  )}
                  {isFailed && (
                    <Badge tone="danger" className="gap-1 text-[10px]">
                      <AlertCircle className="h-3 w-3" /> Failed
                    </Badge>
                  )}
                  {page.status === "pending" && (
                    <Badge tone="neutral" className="text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>

                {/* Line Art Image Box */}
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-border bg-white shadow-inner flex items-center justify-center">
                  {isDone && assetUrl ? (
                    <img
                      src={assetUrl}
                      alt={page.title}
                      className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                      onClick={() => setPreviewPage(page)}
                    />
                  ) : isGenerating ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-primary text-xs font-semibold">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span>Generating line art…</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground/60">
                      <ImageIcon className="h-8 w-8 mb-1" />
                      <span className="text-xs">No illustration yet</span>
                      <span className="text-[10px]">Click Generate to draw</span>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <h4 className="font-semibold text-sm line-clamp-1">{page.title}</h4>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{page.prompt}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 border-t border-border pt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isDone ? "secondary" : "primary"}
                  onClick={() => handleOpenRegenModal(page)}
                  className="flex-1 gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {isDone ? "Regenerate (8 cr)" : "Generate (8 cr)"}
                </Button>
                {isDone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewPage(page)}
                    className="px-2"
                    title="Inspect Full Size"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* SINGLE-PAGE REGENERATION MODAL */}
      {regenPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary font-bold text-xs">
                  #{regenPage.pageNumber}
                </div>
                <div>
                  <h3 className="font-bold text-base">Regenerate Page {regenPage.pageNumber}</h3>
                  <p className="text-xs text-muted-foreground">Regenerates this illustration only (8 credits)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRegenPage(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground">Scene Title</label>
                <input
                  type="text"
                  value={regenPage.title}
                  disabled
                  className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Line Art Prompt (Adjust or add details)
                </label>
                <textarea
                  value={regenPromptTweak}
                  onChange={(e) => setRegenPromptTweak(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono"
                  placeholder="Describe details, e.g. 'Make the cow wear little boots and smile under a sunny tree'"
                />
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary-soft/20 p-3 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Page cost:</span>
                <span className="font-bold text-foreground">8 credits</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={() => setRegenPage(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmRegenerate}
                loading={generatePage.isPending}
                className="gap-1.5 shadow-md"
              >
                <Sparkles className="h-4 w-4" /> Regenerate Page (8 credits)
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* FULL-SIZE PREVIEW MODAL */}
      {previewPage && previewPage.asset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md cursor-pointer"
          onClick={() => setPreviewPage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[85vw] rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 text-black border-b border-neutral-200">
              <span className="font-bold text-sm">
                Page {previewPage.pageNumber}: {previewPage.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPage(null)}
                className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
              >
                Close ✕
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center max-h-[75vh] overflow-hidden">
              <img
                src={`/api/v1/assets/${previewPage.asset.id}/view`}
                alt={previewPage.title}
                className="max-h-[75vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
