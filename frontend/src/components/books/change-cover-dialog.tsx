"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Palette, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { operationRequest } from "@/lib/operation-request";
import type { BookSummary } from "@/lib/types";

const STYLE_OPTIONS = [
  { value: "modern", label: "Modern & Sleek" },
  { value: "minimalist", label: "Minimalist & Elegant" },
  { value: "business", label: "Professional Business / Corporate" },
  { value: "tech", label: "Technology & Digital" },
  { value: "finance", label: "Finance & Wealth" },
  { value: "marketing", label: "Marketing & Growth" },
  { value: "fiction", label: "Fiction & Literary" },
  { value: "romance", label: "Romance & Drama" },
  { value: "mystery", label: "Mystery & Thriller" },
  { value: "fantasy", label: "Epic Fantasy & Magic" },
  { value: "scifi", label: "Science Fiction & Cyberpunk" },
  { value: "children", label: "Children's Illustrated & Storybook" },
  { value: "wellness", label: "Health & Wellness" },
  { value: "artistic", label: "Creative & Artistic" },
];

export function ChangeCoverDialog({
  book,
  open,
  onClose,
}: {
  book: BookSummary;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [style, setStyle] = useState("modern");
  const [userPrompt, setUserPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const isColoring = book.bookType === "coloring_book";
  const studioHref = isColoring
    ? `/app/coloring-book/${book.id}/cover`
    : `/app/books/${book.id}/cover`;

  const handleGenerate = async () => {
    setBusy(true);
    try {
      await operationRequest(`/books/${book.id}/cover/ai-generate`, {
        style,
        userPrompt: userPrompt.trim() || undefined,
      });
      toast.success("AI cover designed and applied!");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["book", book.id] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["cover"] }),
      ]);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cover Design & Studio"
      description={`Update or generate a professional cover for "${book.title}".`}
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-primary/20 bg-primary-soft/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            <span>Generate with OpenAI</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Our AI analyzes your book&apos;s title, topic, and audience to design a custom commercial cover artwork with separately layered editable typography.
          </p>

          <div className="mt-3 space-y-3">
            <Field label="Design Direction" htmlFor={`cover-style-${book.id}`}>
              <Select
                id={`cover-style-${book.id}`}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                disabled={busy}
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Custom Visual Instructions (Optional)" htmlFor={`cover-prompt-${book.id}`}>
              <Textarea
                id={`cover-prompt-${book.id}`}
                placeholder="e.g. Warm sunset lighting, clean geometric icons, bold corporate palette"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                maxLength={500}
                className="min-h-16 text-xs"
                disabled={busy}
              />
            </Field>

            <Button
              className="w-full font-semibold shadow-sm"
              onClick={handleGenerate}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Designing Cover with AI…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate New AI Cover
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Link
            href={studioHref}
            onClick={onClose}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Palette className="mr-2 h-4 w-4" />
            Open Full Cover Studio
            <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-60" />
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
