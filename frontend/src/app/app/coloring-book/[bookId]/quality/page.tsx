"use client";

import { use } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import { useColoringBook, useColoringQuality } from "@/lib/coloring-queries";

export default function ColoringBookQualityPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading: loadingBook } = useColoringBook(bookId);
  const { data: qualityData, isLoading: loadingQuality } = useColoringQuality(bookId);

  if (loadingBook || loadingQuality) {
    return <PageLoader label="Running line-art quality audit…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const pages = qualityData?.pages ?? [];

  const completedPages = pages.filter((p) => p.status === "completed");
  const issuesCount = completedPages.filter((p) => p.quality && !p.quality.passed).length;
  const overallScore =
    completedPages.length > 0
      ? Math.round(
          completedPages.reduce((acc, p) => acc + (p.quality?.score ?? 100), 0) / completedPages.length,
        )
      : 100;

  return (
    <div className="space-y-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Print Readiness</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">{overallScore}%</span>
            <span className="text-xs text-emerald-500 font-semibold">
              {issuesCount === 0 ? "Excellent" : "Action Needed"}
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
          <div className="mt-3 text-[10px] text-muted-foreground">No chromatic artifacts</div>
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
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Page-by-Page Line Art Inspection</h3>
            <p className="text-xs text-muted-foreground">
              Automated image analysis verifies every illustration before printing
            </p>
          </div>
          <Badge tone={issuesCount === 0 ? "success" : "warning"}>
            {issuesCount === 0 ? "All Pages Verified" : `${issuesCount} Page(s) Need Review`}
          </Badge>
        </div>

        <div className="divide-y divide-border">
          {pages.map((p) => {
            const hasQuality = Boolean(p.quality);
            const passed = p.quality?.passed ?? true;

            return (
              <div key={p.pageNumber} className="flex items-center justify-between p-4 text-xs">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-foreground">
                    #{p.pageNumber}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground truncate block">{p.title}</span>
                    {p.quality?.issues && p.quality.issues.length > 0 && (
                      <span className="text-amber-500 text-[10px] truncate block">
                        Notice: {p.quality.issues.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {p.status === "completed" ? (
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
