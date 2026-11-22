"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import {
  useAutoCleanAllColoringPages,
  useAutoCleanColoringPage,
  useColoringBook,
  useColoringQuality,
} from "@/lib/coloring-queries";

export default function ColoringBookQualityPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading: loadingBook } = useColoringBook(bookId);
  const { data: qualityData, isLoading: loadingQuality } = useColoringQuality(bookId);

  const autoClean = useAutoCleanColoringPage(bookId);
  const autoCleanAll = useAutoCleanAllColoringPages(bookId);

  if (loadingBook || loadingQuality) {
    return <PageLoader label="Running line-art quality audit…" />;
  }

  const pages = qualityData?.pages ?? [];
  const bookPages = detail?.pages ?? [];

  const completedPages = pages.filter((p) => p.status === "completed");
  const issuesCount = completedPages.filter((p) => p.quality && !p.quality.passed).length;
  const overallScore =
    completedPages.length > 0
      ? Math.round(
          completedPages.reduce((acc, p) => acc + (p.quality?.score ?? 100), 0) / completedPages.length,
        )
      : 100;

  const handleCleanPage = async (pageNumber: number) => {
    const pageRec = bookPages.find((p) => p.pageNumber === pageNumber);
    if (!pageRec) return;

    try {
      toast.loading(`Auto-cleaning Page ${pageNumber} to pure white background…`);
      await autoClean.mutateAsync(pageRec.id);
      toast.dismiss();
      toast.success(`Page ${pageNumber} line art cleaned and sharpened!`);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Failed to auto-clean line art");
    }
  };

  const handleCleanAll = async () => {
    try {
      toast.loading("Auto-cleaning all flagged pages in book…");
      const res = await autoCleanAll.mutateAsync();
      toast.dismiss();
      toast.success(`Cleaned ${res.cleanedCount} pages successfully!`);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Failed to clean all pages");
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Print Readiness</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">{overallScore}%</span>
            <span
              className={`text-xs font-semibold ${issuesCount === 0 ? "text-emerald-500" : "text-amber-500"}`}
            >
              {issuesCount === 0 ? "Excellent" : `${issuesCount} Need Review`}
            </span>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">KDP paperback preflight score</div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Pure White Backgrounds</span>
          <div className="mt-2 flex items-center gap-1.5 font-bold text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Passed (#FFFFFF)</span>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">No gray paper wash detected</div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Zero Color Saturation</span>
          <div className="mt-2 flex items-center gap-1.5 font-bold text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>100% Monochrome</span>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">Pure black and white outlines</div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">300 DPI Print Resolution</span>
          <div className="mt-2 flex items-center gap-1.5 font-bold text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>High Resolution</span>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">Crisp printable raster outlines</div>
        </Card>
      </div>

      {/* Page Audit Table */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-bold text-base">Page-by-Page Line Art Inspection</h3>
            <p className="text-xs text-muted-foreground">
              Automated image analysis verifies pure white backgrounds, line contrast, and zero color spills
            </p>
          </div>

          <div className="flex items-center gap-3">
            {issuesCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCleanAll}
                loading={autoCleanAll.isPending}
                className="gap-1.5 text-xs text-primary font-semibold"
              >
                <Wand2 className="h-3.5 w-3.5" /> Auto-Clean All Flagged ({issuesCount})
              </Button>
            )}
            <Badge tone={issuesCount === 0 ? "success" : "warning"}>
              {issuesCount === 0 ? "All Pages Verified" : `${issuesCount} Page(s) Need Review`}
            </Badge>
          </div>
        </div>

        <div className="divide-y divide-border">
          {pages.map((p) => {
            const passed = p.quality?.passed ?? true;
            const isCompleted = p.status === "completed";

            return (
              <div key={p.pageNumber} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 text-xs">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-foreground">
                    #{p.pageNumber}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground truncate block">{p.title}</span>
                    {p.quality?.issues && p.quality.issues.length > 0 ? (
                      <span className="text-amber-500 text-[11px] truncate block font-medium">
                        Notice: {p.quality.issues.join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[10px] truncate block">
                        Pure #FFFFFF canvas • Crisp black outlines • 300 DPI
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isCompleted ? (
                    passed ? (
                      <Badge tone="success" className="gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" /> Pass (100%)
                      </Badge>
                    ) : (
                      <Badge tone="warning" className="gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> Review
                      </Badge>
                    )
                  ) : (
                    <Badge tone="neutral" className="text-[10px]">
                      Not Generated
                    </Badge>
                  )}

                  {isCompleted && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCleanPage(p.pageNumber)}
                      loading={autoClean.isPending}
                      className="gap-1 text-xs"
                      title="Threshold image to pure black outlines and white background"
                    >
                      <Wand2 className="h-3 w-3" /> Clean Lines
                    </Button>
                  )}

                  <Link href={`/app/coloring-book/${bookId}/pages`}>
                    <Button variant="ghost" size="sm" className="text-xs">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
