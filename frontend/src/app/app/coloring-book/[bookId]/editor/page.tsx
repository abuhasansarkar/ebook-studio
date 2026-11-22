"use client";

import { use, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import {
  useAutoCleanColoringPage,
  useColoringBook,
  useGenerateColoringPage,
  useUpdateColoringPage,
} from "@/lib/coloring-queries";
import { cn } from "@/lib/utils";

export default function ColoringBookEditorPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading } = useColoringBook(bookId);

  const updatePage = useUpdateColoringPage(bookId);
  const generatePage = useGenerateColoringPage(bookId);
  const autoClean = useAutoCleanColoringPage(bookId);

  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [showMargins, setShowMargins] = useState(true);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editNegativePrompt, setEditNegativePrompt] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return <PageLoader label="Loading editor canvas…" />;
  }

  const plan = detail?.plan;
  const pages = detail?.pages ?? [];

  const activePage = pages.find((p) => p.pageNumber === selectedPageNumber) || pages[0];
  const assetUrl = activePage?.asset ? `/api/v1/assets/${activePage.asset.id}/view` : null;
  const quality = activePage?.qualityChecks;
  const hasQualityIssues = quality && !quality.passed;

  const handleSelectPage = (pageNumber: number) => {
    setSelectedPageNumber(pageNumber);
    const p = pages.find((x) => x.pageNumber === pageNumber);
    if (p) {
      setEditTitle(p.title);
      setEditPrompt(p.prompt);
      setEditNegativePrompt(p.negativePrompt || "");
      setEditCaption(p.caption || "");
    }
  };

  const handleSaveDetails = async () => {
    if (!activePage) return;
    try {
      await updatePage.mutateAsync({
        pageId: activePage.id,
        updates: {
          title: editTitle || activePage.title,
          prompt: editPrompt || activePage.prompt,
          negativePrompt: editNegativePrompt !== "" ? editNegativePrompt : undefined,
          caption: editCaption,
        },
      });
      toast.success("Page details saved");
    } catch {
      toast.error("Failed to save page");
    }
  };

  const handleRegenerate = async () => {
    if (!activePage) return;
    try {
      await generatePage.mutateAsync({
        pageId: activePage.id,
        promptOverride: editPrompt || activePage.prompt,
      });
      // The page polls in the background until the new illustration is ready.
      toast.success(`Page ${activePage.pageNumber} queued for regeneration. It updates automatically when ready.`);
    } catch (err) {
      toast.error((err as Error).message || "Regeneration failed");
    }
  };

  const handleCleanLines = async () => {
    if (!activePage || !activePage.asset) return;
    try {
      toast.loading(`Auto-cleaning Page ${activePage.pageNumber} lines and background…`);
      await autoClean.mutateAsync(activePage.id);
      toast.dismiss();
      toast.success(`Page ${activePage.pageNumber} sharpened to pure black & white!`);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Failed to auto-clean line art");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePage) return;
    setUploading(true);
    try {
      toast.loading("Uploading custom line-art illustration…");
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { asset } = await res.json();
      await updatePage.mutateAsync({
        pageId: activePage.id,
        updates: { assetId: asset.id },
      });
      toast.dismiss();
      toast.success("Custom illustration uploaded!");
    } catch {
      toast.dismiss();
      toast.error("Failed to upload custom illustration");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Page Selector Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {pages.map((p) => {
          const isSelected = p.pageNumber === (activePage?.pageNumber ?? 1);
          const hasImage = Boolean(p.assetId);

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPage(p.pageNumber)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                isSelected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : hasImage
                    ? "border-border bg-surface text-foreground hover:bg-muted"
                    : "border-border/60 bg-surface/50 text-muted-foreground opacity-60",
              )}
            >
              <span>Page {p.pageNumber}</span>
              {hasImage && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      {/* Editor Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left (7 cols): Interactive Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Zoom and overlay controls */}
          <div className="mb-3 flex items-center justify-between w-full px-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Canvas</span>
              <span>•</span>
              <span>{plan?.trimSize} paperback</span>
              {activePage?.asset && (
                quality?.passed ? (
                  <Badge tone="success" className="gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> 100% Quality Pass
                  </Badge>
                ) : (
                  <Badge tone="warning" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> Minor Shading Detected
                  </Badge>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMargins(!showMargins)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 transition-colors",
                  showMargins ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-muted",
                )}
              >
                {showMargins ? "Margins On" : "Margins Off"}
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                className="rounded-lg border border-border p-1 hover:bg-muted"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono w-10 text-center">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(200, z + 25))}
                className="rounded-lg border border-border p-1 hover:bg-muted"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Paper Canvas */}
          <div className="relative w-full max-w-xl aspect-[3/4] rounded-2xl border border-border bg-white shadow-2xl overflow-hidden flex items-center justify-center p-6">
            {/* Margins Overlay */}
            {showMargins && (
              <div className="pointer-events-none absolute inset-6 border border-dashed border-emerald-500/40 z-10 flex flex-col justify-between p-2">
                <span className="text-[10px] font-mono font-semibold text-emerald-600/70">
                  Safe Gutter (0.75 in)
                </span>
                <span className="text-[10px] font-mono font-semibold text-emerald-600/70 self-end">
                  Safe Margin (0.5 in)
                </span>
              </div>
            )}

            {/* Illustration Image */}
            {assetUrl ? (
              <img
                src={assetUrl}
                alt={activePage?.title}
                style={{ transform: `scale(${zoom / 100})` }}
                className="max-h-full max-w-full object-contain transition-transform duration-200"
              />
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary opacity-60" />
                <p className="font-semibold text-sm">No illustration generated yet</p>
                <p className="text-xs mt-1">Click Regenerate to draw Page {activePage?.pageNumber}</p>
              </div>
            )}
          </div>

          {/* Quality Notice Banner if issues exist */}
          {hasQualityIssues && (
            <div className="mt-3 w-full max-w-xl flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Notice: {quality?.issues.join(", ")}</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCleanLines}
                loading={autoClean.isPending}
                className="gap-1 text-xs shrink-0"
              >
                <Wand2 className="h-3 w-3" /> Fix Line Art
              </Button>
            </div>
          )}
        </div>

        {/* Right (5 cols): Controls & Prompt Refinements */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="font-bold text-base">Page {activePage?.pageNumber} Settings</h3>
                <p className="text-xs text-muted-foreground">Customize prompts, exclusions and captions</p>
              </div>
              <Badge tone="primary">8 credits to regenerate</Badge>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Scene Title</label>
              <input
                type="text"
                defaultValue={activePage?.title}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Line Art Scene Prompt</label>
              <textarea
                defaultValue={activePage?.prompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">
                Negative Prompt (Exclusions)
              </label>
              <input
                type="text"
                defaultValue={activePage?.negativePrompt || ""}
                onChange={(e) => setEditNegativePrompt(e.target.value)}
                placeholder="e.g. no shading, no gray, no text, no borders"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">
                Optional Page Caption (Printed below illustration)
              </label>
              <input
                type="text"
                defaultValue={activePage?.caption || ""}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder="e.g. C is for Cow"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveDetails}
                loading={updatePage.isPending}
                className="flex-1 gap-1.5"
              >
                <Save className="h-3.5 w-3.5" /> Save Details
              </Button>

              {activePage?.asset && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCleanLines}
                  loading={autoClean.isPending}
                  className="gap-1.5"
                  title="Purify background to pure #FFFFFF and lines to pure #000000"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Clean Lines
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={handleRegenerate}
                loading={generatePage.isPending || activePage?.status === "generating"}
                disabled={activePage?.status === "generating"}
                className="flex-1 gap-1.5 shadow-md"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate (8 cr)
              </Button>
            </div>

            <div className="pt-2 border-t border-border">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                loading={uploading}
                className="w-full gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Custom Line Art Replacement
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
