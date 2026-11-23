"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Grid,
  Image as ImageIcon,
  PenTool,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { useColoringBook } from "@/lib/coloring-queries";
import { cn } from "@/lib/utils";

const STAGES = [
  { href: "plan", label: "Plan", icon: FileText, desc: "Concept & Scenes" },
  { href: "pages", label: "Pages", icon: Grid, desc: "Illustrations & Grid" },
  { href: "editor", label: "Editor", icon: PenTool, desc: "Prompt Tuning" },
  { href: "quality", label: "Quality", icon: ShieldCheck, desc: "Preflight Check" },
  { href: "cover", label: "Cover", icon: ImageIcon, desc: "Spine & Artwork" },
  { href: "preview", label: "Preview", icon: Eye, desc: "Book Spreads" },
  { href: "export", label: "Export", icon: Download, desc: "KDP Print PDF" },
] as const;

export function ColoringHeader({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const pathname = usePathname();
  const { data: detail } = useColoringBook(bookId);

  const book = detail?.book;
  const plan = detail?.plan;
  const stats = detail?.stats;

  return (
    <div className="border-b border-border bg-surface" suppressHydrationWarning>
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-8" suppressHydrationWarning>
        <div className="flex items-center justify-between">
          <Link
            href="/app/coloring-book"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Coloring Studio
          </Link>
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Generated:</span>
              <span className="font-semibold text-foreground">
                {stats.completed} / {stats.total} pages
              </span>
              {stats.completed === stats.total && stats.total > 0 && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {book?.title || "Coloring Book"}
              </h1>
              {plan && (
                <Badge tone="primary" className="uppercase tracking-wider">
                  {plan.artStyle.replace(/_/g, " ")}
                </Badge>
              )}
              {plan?.singleSided && (
                <Badge tone="neutral" className="hidden sm:inline-flex">
                  Single-Sided Print
                </Badge>
              )}
            </div>
            {book?.subtitle && <p className="truncate text-xs text-muted-foreground">{book.subtitle}</p>}
          </div>
        </div>

        <nav className="-mb-px mt-5 flex space-x-1 overflow-x-auto pe-6 sm:pe-2" aria-label="Coloring studio workflow">
          {STAGES.map(({ href, label, icon: Icon, desc }) => {
            const active = pathname.endsWith(`/${href}`);
            return (
              <Link
                key={href}
                href={`/app/coloring-book/${bookId}/${href}`}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
