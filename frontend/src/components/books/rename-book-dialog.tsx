"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import type { BookSummary } from "@/lib/types";

export function RenameBookDialog({
  book,
  open,
  onClose,
}: {
  book: BookSummary;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle || "");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/books/${book.id}`, {
        title: title.trim(),
        subtitle: subtitle.trim(),
      });
      toast.success("Ebook renamed successfully.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["book", book.id] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
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
      title="Rename eBook"
      description="Update the title and subtitle for this ebook."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Book Title" htmlFor={`rename-title-${book.id}`}>
          <Input
            id={`rename-title-${book.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            disabled={busy}
            autoFocus
          />
        </Field>
        <Field label="Subtitle (Optional)" htmlFor={`rename-subtitle-${book.id}`}>
          <Input
            id={`rename-subtitle-${book.id}`}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={300}
            disabled={busy}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
