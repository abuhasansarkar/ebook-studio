"use client";

import { cn } from "@/lib/utils";

export type FilterStatus = "all" | "draft" | "in_progress" | "written" | "archived";

interface EbookFiltersProps {
  currentStatus: string;
  isArchived: string;
  onSelect: (filter: { status?: string; archived?: string }) => void;
  className?: string;
}

export function EbookFilters({
  currentStatus,
  isArchived,
  onSelect,
  className,
}: EbookFiltersProps) {
  // Determine active filter pill
  const activeTab: FilterStatus =
    isArchived === "archived"
      ? "archived"
      : currentStatus === "draft"
      ? "draft"
      : currentStatus === "written"
      ? "written"
      : currentStatus === "outline_ready" || currentStatus === "generating"
      ? "in_progress"
      : "all";

  const tabs: { id: FilterStatus; label: string }[] = [
    { id: "all", label: "All eBooks" },
    { id: "draft", label: "Drafts" },
    { id: "in_progress", label: "In Progress" },
    { id: "written", label: "Completed" },
    { id: "archived", label: "Archived" },
  ];

  const handleTabClick = (id: FilterStatus) => {
    switch (id) {
      case "all":
        onSelect({ status: undefined, archived: "active" });
        break;
      case "draft":
        onSelect({ status: "draft", archived: "active" });
        break;
      case "in_progress":
        onSelect({ status: "outline_ready", archived: "active" });
        break;
      case "written":
        onSelect({ status: "written", archived: "active" });
        break;
      case "archived":
        onSelect({ status: undefined, archived: "archived" });
        break;
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 select-none",
              isActive
                ? "bg-foreground text-background shadow-sm"
                : "bg-surface border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
