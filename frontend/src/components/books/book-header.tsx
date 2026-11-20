"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, FileDown, ListTree, PenLine, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { getLanguage } from "@ebook/shared";
import { Badge } from "@/components/ui/misc";
import { useBook, useDeleteBook } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { STATUS_META } from "./book-card";

export function BookHeader({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const { data: book } = useBook(bookId);
  const deleteBook = useDeleteBook();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const approved = Boolean(book?.outline?.approvedAt);
  const writtenCount = book?.chapters.filter((c) => c.status === "done").length ?? 0;
  const tabs = [
    { href: "outline", label: "Outline", icon: ListTree, done: approved, enabled: true },
    { href: "generate", label: "Write", icon: Wand2, done: book ? writtenCount > 0 && writtenCount === book.chapters.length : false, enabled: approved },
    { href: "editor", label: "Edit", icon: PenLine, done: false, enabled: writtenCount > 0 },
    { href: "export", label: "Export", icon: FileDown, done: false, enabled: writtenCount > 0 },
  ];
  const lang = book ? getLanguage(book.language) : null;
  const status = book ? STATUS_META[book.status] : null;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-8">
        <Link href="/app/books" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My eBooks
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 lang={lang?.code} dir={lang?.dir} className="min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl">
            {book?.title ?? "Loading…"}
          </h1>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {lang && <Badge>{lang.nativeName}</Badge>}
          <Button variant="ghost" size="sm" className="ms-auto text-muted-foreground hover:text-danger" onClick={() => setConfirmDelete(true)} disabled={!book}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
        <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Book steps">
          {tabs.map(({ href, label, icon: Icon, done, enabled }) => {
            const active = pathname.endsWith(`/${href}`);
            const cls = cn(
              "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              enabled ? "hover:text-foreground" : "cursor-not-allowed opacity-45",
            );
            const inner = (
              <>
                {done ? <Check className="h-4 w-4 text-success" /> : <Icon className="h-4 w-4" />}
                {label}
              </>
            );
            return enabled ? (
              <Link key={href} href={`/app/books/${bookId}/${href}`} className={cls} aria-current={active ? "page" : undefined}>
                {inner}
              </Link>
            ) : (
              <span key={href} className={cls} aria-disabled="true" title="Complete the previous step first">
                {inner}
              </span>
            );
          })}
        </nav>
      </div>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this book?" description={`"${book?.title ?? ""}" will be removed from your library. Credits already used are not refunded.`}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteBook.isPending}
            onClick={() =>
              deleteBook.mutate(bookId, {
                onSuccess: () => {
                  toast.success("Book deleted");
                  router.replace("/app/books");
                },
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Delete book
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
