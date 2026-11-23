"use client";

import type { BookStatus } from "@ebook/shared";
import { Badge } from "@/components/ui/misc";

export const BOOK_STATUS_CONFIG: Record<
  BookStatus,
  { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" }
> = {
  draft: { label: "Planning", tone: "neutral" },
  outline_ready: { label: "Outline ready", tone: "primary" },
  generating: { label: "Writing…", tone: "warning" },
  written: { label: "Completed", tone: "success" },
  failed: { label: "Needs review", tone: "danger" },
};

export function EbookStatusBadge({
  status,
  archivedAt,
  className,
}: {
  status: BookStatus;
  archivedAt?: string | null;
  className?: string;
}) {
  const config = BOOK_STATUS_CONFIG[status] ?? BOOK_STATUS_CONFIG.draft;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {archivedAt && (
        <Badge tone="neutral" className="text-[11px] font-medium border-border/80">
          Archived
        </Badge>
      )}
      <Badge tone={config.tone} className={`text-[11px] font-medium ${className ?? ""}`}>
        {config.label}
      </Badge>
    </div>
  );
}
