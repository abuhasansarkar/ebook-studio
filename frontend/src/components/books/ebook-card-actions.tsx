"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MoreVertical,
  BookOpen,
  Edit3,
  Eye,
  Image as ImageIcon,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RenameBookDialog } from "./rename-book-dialog";
import { DuplicateBookDialog } from "./duplicate-book-dialog";
import { ChangeCoverDialog } from "./change-cover-dialog";
import { api, errorMessage } from "@/lib/api";
import type { BookSummary } from "@/lib/types";

interface EbookCardActionsProps {
  book: BookSummary;
  className?: string;
}

export function EbookCardActions({ book, className }: EbookCardActionsProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const isColoring = book.bookType === "coloring_book";
  const editorHref = isColoring
    ? `/app/coloring-book/${book.id}/pages`
    : `/app/books/${book.id}/editor`;
  const previewHref = isColoring
    ? `/app/coloring-book/${book.id}/preview`
    : `/app/books/${book.id}/preview`;

  const handleArchiveToggle = async () => {
    setBusy(true);
    setMenuOpen(false);
    try {
      await api.patch(`/books/${book.id}`, {
        archived: !book.archivedAt,
      });
      toast.success(book.archivedAt ? "Book restored from archive." : "Book archived.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/books/${book.id}`);
      toast.success("Ebook deleted.");
      setDeleteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["books"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={menuRef}
      className={`relative inline-block ${className ?? ""}`}
      onClick={(e) => {
        // Prevent clicking the menu container from triggering parent card link
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label={`Actions for ${book.title}`}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-52 origin-top-right rounded-xl border border-border bg-surface p-1.5 shadow-xl transition-all animate-in fade-in zoom-in-95"
        >
          <Link
            href={editorHref}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span>Open Ebook</span>
          </Link>

          <Link
            href={editorHref}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Continue Editing</span>
          </Link>

          <Link
            href={previewHref}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Preview</span>
          </Link>

          <div className="my-1 border-t border-border/60" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setCoverOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Change Cover</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setRenameOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Rename</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDuplicateOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={handleArchiveToggle}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            {book.archivedAt ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Restore from Archive</span>
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Archive</span>
              </>
            )}
          </button>

          <div className="my-1 border-t border-border/60" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-danger hover:bg-danger-soft transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 text-danger" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Action Dialogs */}
      <RenameBookDialog
        book={book}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
      />

      <DuplicateBookDialog
        book={book}
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
      />

      <ChangeCoverDialog
        book={book}
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete eBook?"
        description={`Are you sure you want to delete "${book.title}"? This cannot be undone.`}
        confirmLabel="Delete eBook"
        tone="danger"
      >
        <p className="text-xs text-muted-foreground">
          All chapters, outlines, and manuscript drafts for this ebook will be removed.
        </p>
      </ConfirmDialog>
    </div>
  );
}
