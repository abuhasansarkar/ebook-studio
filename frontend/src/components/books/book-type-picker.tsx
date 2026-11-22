"use client";

import { BookMarked, BookOpen, ChefHat, ClipboardList, FileBarChart, GraduationCap, Heart, Magnet, Map, Palette, Sparkles, type LucideIcon } from "lucide-react";
import { BOOK_TYPES, BOOK_TYPE_LABELS, type BookType } from "@ebook/shared";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<BookType, LucideIcon> = {
  guide: BookOpen,
  lead_magnet: Magnet,
  workbook: ClipboardList,
  report: FileBarChart,
  course: GraduationCap,
  self_help: Heart,
  educational: BookMarked,
  recipe: ChefHat,
  travel: Map,
  fiction: Sparkles,
  coloring_book: Palette,
};

/** "self_help" → "Self help", for the option labels of the brief's enums. */
export const enumLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** The grid of book types, shared by the create wizard and the brief editor. */
export function BookTypePicker({ value, onChange, disabled }: { value: BookType; onChange: (value: BookType) => void; disabled?: boolean }) {
  return (
    <RadioGroup
      label="Book type"
      value={value}
      onChange={(t) => !disabled && onChange(t)}
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      itemClassName={(_option, selected) =>
        cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center text-xs font-medium transition",
          selected ? "border-primary bg-primary-soft text-primary-hover" : "border-border hover:bg-muted",
          disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        )
      }
      options={BOOK_TYPES.map((t) => {
        const Icon = TYPE_ICONS[t];
        return {
          value: t,
          label: (
            <>
              <Icon className="h-5 w-5" />
              {BOOK_TYPE_LABELS[t]}
            </>
          ),
        };
      })}
    />
  );
}
