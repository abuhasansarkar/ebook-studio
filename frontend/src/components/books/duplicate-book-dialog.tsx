"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { BookSummary } from "@/lib/types";

export function DuplicateBookDialog({
  book,
  open,
  onClose,
}: {
  book: BookSummary;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [includeManuscript, setIncludeManuscript] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleDuplicate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ book: { id: string } }>(`/books/${book.id}/duplicate`, {
        includeManuscript,
      });
      toast.success("Ebook duplicated successfully.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      onClose();
      router.push(`/app/books/${res.book.id}/editor`);
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
      title="Duplicate eBook"
      description={`Create a copy of "${book.title}".`}
      className="max-w-md"
    >
      <div className="space-y-4">
        <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeManuscript}
            onChange={(e) => setIncludeManuscript(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
            disabled={busy}
          />
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-foreground">Include written chapters</span>
            <p className="text-xs text-muted-foreground">
              Copies all existing chapter drafts and content. Uncheck to copy only the outline and planning brief.
            </p>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={busy}>
            {busy ? "Duplicating…" : "Duplicate eBook"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
