"use client";

import { ArrowUpDown } from "lucide-react";
import { Select } from "@/components/ui/form";

export const SORT_OPTIONS = [
  { value: "updated", label: "Recently Updated" },
  { value: "newest", label: "Recently Created" },
  { value: "title", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
];

export function EbookSort({
  value,
  onChange,
}: {
  value: string;
  onChange: (sort: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select
        value={value || "updated"}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sort eBooks"
        className="h-9 py-1 text-xs font-medium border-border/80 bg-surface shadow-none"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
