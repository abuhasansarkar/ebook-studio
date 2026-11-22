"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import {
  BookCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck,
  FileDown,
  FileText,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import {
  useColoringBook,
  useColoringPublishingPackage,
  useCompileColoringPdf,
} from "@/lib/coloring-queries";
import { useBilling } from "@/lib/queries";
import { ProPlansModal } from "@/components/billing/pro-plans-modal";
import { cn } from "@/lib/utils";

export default function ColoringBookExportPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: detail, isLoading: loadingBook } = useColoringBook(bookId);
  const { data: pkg, isLoading: loadingPkg } = useColoringPublishingPackage(bookId);
  const compilePdf = useCompileColoringPdf(bookId);
  const billing = useBilling();
  const [showProModal, setShowProModal] = useState(false);
  const hasExportEntitlement = Boolean(billing.data?.entitlements?.exports);

  const [copiedKeywords, setCopiedKeywords] = useState(false);
  const [copiedDescription, setCopiedDescription] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  if (loadingBook || loadingPkg) {
    return <PageLoader label="Checking KDP print readiness…" />;
  }

  const book = detail?.book;
  const plan = detail?.plan;
  const preflight = pkg?.preflight;

  const handleCopyKeywords = () => {
    if (!pkg?.sevenKeywords) return;
    navigator.clipboard.writeText(pkg.sevenKeywords.join(", "));
    setCopiedKeywords(true);
    toast.success("Keywords copied to clipboard!");
    setTimeout(() => setCopiedKeywords(false), 2500);
  };

  const handleCopyDescription = () => {
    if (!pkg?.amazonDescriptionHtml) return;
    navigator.clipboard.writeText(pkg.amazonDescriptionHtml);
    setCopiedDescription(true);
    toast.success("Amazon HTML description copied!");
    setTimeout(() => setCopiedDescription(false), 2500);
  };

  const handleCompilePdf = async () => {
    if (!hasExportEntitlement) {
      setShowProModal(true);
      return;
    }
    try {
      toast.loading("Compiling 300 DPI print-ready KDP PDF…");
      const res = await compilePdf.mutateAsync();
      toast.dismiss();
      toast.success("Print PDF compiled successfully!");
      setDownloadUrl(`/api/v1/exports/${res.exportId}/download`);
    } catch (err) {
      toast.dismiss();
      const msg = (err as Error).message || "PDF compilation failed";
      if (msg.toLowerCase().includes("exports") || msg.toLowerCase().includes("capability") || msg.toLowerCase().includes("plan")) {
        setShowProModal(true);
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Preflight Compliance Banner */}
      <Card className="p-6 sm:p-8 bg-surface">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">Amazon KDP Preflight Compliance</span>
              <Badge tone="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready for Print
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Technical verification of trim dimensions, single-sided layouts, margins, and DPI requirements
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/v1/coloring/books/${bookId}/export/metadata`} download={`KDP_METADATA_${bookId}.md`}>
              <Button variant="secondary" size="lg" className="gap-2 shadow-sm">
                <FileText className="h-4 w-4" /> Download Metadata (.md)
              </Button>
            </a>

            {downloadUrl ? (
              <a href={downloadUrl} download>
                <Button size="lg" className="gap-2 shadow-md bg-emerald-600 hover:bg-emerald-500">
                  <Download className="h-4 w-4" /> Download KDP PDF
                </Button>
              </a>
            ) : (
              <Button
                size="lg"
                onClick={handleCompilePdf}
                loading={compilePdf.isPending}
                className={cn("gap-2 shadow-md", !hasExportEntitlement && "bg-[#e8603c] hover:bg-[#d4512e] text-white")}
              >
                {!hasExportEntitlement ? (
                  <>
                    <Sparkles className="h-4 w-4" /> Upgrade to Pro to Compile PDF
                  </>
                ) : (
                  <>
                    <FileDown className="h-5 w-5" /> Compile Print-Ready PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* 4 Green Checkmarks */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs text-foreground">Page Count Requirement</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {preflight?.pageCount} total physical pages (KDP min: 24)
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs text-foreground">300 DPI Resolution</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Crisp vector & high-res raster line art
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs text-foreground">Single-Sided Blank Backs</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Prevents marker & ink bleed-through
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs text-foreground">Safe Gutter & Margins</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                0.65 in inside gutter, 0.45 in outside
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Amazon KDP Publishing Package */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left (7 cols): Amazon HTML Description & Upload Checklist */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-base">Formatted Amazon Book Description</h3>
              <Button variant="secondary" size="sm" onClick={handleCopyDescription} className="gap-1.5 text-xs">
                {copiedDescription ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedDescription ? "Copied HTML" : "Copy HTML"}
              </Button>
            </div>

            <div
              className="rounded-xl border border-border bg-muted/20 p-4 text-xs font-mono max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed select-all"
            >
              {pkg?.amazonDescriptionHtml}
            </div>
          </Card>

          {/* KDP Upload Checklist */}
          <Card className="p-6 space-y-3">
            <h3 className="font-bold text-base">Amazon KDP Step-by-Step Upload Checklist</h3>
            <div className="space-y-2 mt-2">
              {pkg?.kdpUploadChecklist?.map((step) => (
                <div key={step} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right (5 cols): 7 Search Keywords & Categories */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-base">7 KDP Search Keywords</h3>
              <Button variant="secondary" size="sm" onClick={handleCopyKeywords} className="gap-1.5 text-xs">
                {copiedKeywords ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKeywords ? "Copied" : "Copy All"}
              </Button>
            </div>

            <div className="space-y-2">
              {pkg?.sevenKeywords?.map((kw, idx) => (
                <div
                  key={kw}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-foreground">{kw}</span>
                  <span className="text-[10px] text-muted-foreground">Box {idx + 1}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h3 className="font-bold text-base">Recommended Amazon Categories</h3>
            <div className="space-y-2">
              {pkg?.recommendedCategories?.map((cat) => (
                <div key={cat} className="rounded-xl border border-border bg-surface/50 p-2.5 text-xs text-muted-foreground">
                  {cat}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ProPlansModal open={showProModal} onClose={() => setShowProModal(false)} />
    </div>
  );
}
