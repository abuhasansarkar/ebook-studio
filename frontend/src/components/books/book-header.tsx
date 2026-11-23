"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ClipboardCheck, FileDown, FileText, Image as ImageIcon, Library, ListTree, Megaphone, Package, Palette, PenLine, Receipt, Trash2, Wand2, type LucideIcon } from "lucide-react";
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
  const allWritten = book ? writtenCount > 0 && writtenCount === book.chapters.length : false;
  const hasText = writtenCount > 0;
  const stages: { label: string; tabs: { href: string; label: string; icon: LucideIcon; done: boolean; enabled: boolean; hint?: string }[] }[] = [
    {
      label: "Plan",
      tabs: [
        { href: "brief", label: "Brief", icon: FileText, done: false, enabled: true },
        { href: "outline", label: "Outline", icon: ListTree, done: approved, enabled: true },
      ],
    },
    {
      label: "Write",
      tabs: [
        { href: "generate", label: "Write", icon: Wand2, done: allWritten, enabled: approved, hint: "Approve the outline first" },
        { href: "editor", label: "Editor", icon: PenLine, done: false, enabled: true },
        { href: "research", label: "Research", icon: Library, done: false, enabled: true },
      ],
    },
    {
      label: "Polish",
      tabs: [
        { href: "quality", label: "Review", icon: ClipboardCheck, done: false, enabled: true },
        { href: "design", label: "Design", icon: Palette, done: false, enabled: true },
        { href: "cover", label: "Cover", icon: ImageIcon, done: false, enabled: true },
      ],
    },
    {
      label: "Publish",
      tabs: [
        { href: "export", label: "Export", icon: FileDown, done: false, enabled: hasText, hint: "Write a chapter first" },
        { href: "distribution", label: "Distribute", icon: Package, done: false, enabled: hasText, hint: "Write a chapter first" },
        { href: "listing", label: "Listing", icon: Receipt, done: false, enabled: hasText, hint: "Write a chapter first" },
        { href: "marketing", label: "Marketing", icon: Megaphone, done: false, enabled: hasText, hint: "Write a chapter first" },
      ],
    },
  ];
  const lang = book ? getLanguage(book.language) : null;
  const status = book ? STATUS_META[book.status] : null;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-8">
        <Link href="/app/books" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My eBooks
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <h1 lang={lang?.code} dir={lang?.dir} className="min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl">
              {book?.title ?? "Loading…"}
            </h1>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {lang && <Badge>{lang.nativeName}</Badge>}
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={() => setConfirmDelete(true)} disabled={!book}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
        <nav className="-mb-px mt-4 flex items-end gap-0 overflow-x-auto pe-6 sm:pe-2" aria-label="Book steps">
          {stages.map((stage, stageIndex) => (
            <div key={stage.label} role="group" aria-label={stage.label} className={cn("flex shrink-0 flex-col", stageIndex > 0 && "ms-2 border-s border-border ps-2")}>
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80" aria-hidden="true">
                {stage.label}
              </span>
              <div className="flex">
                {stage.tabs.map(({ href, label, icon: Icon, done, enabled, hint }) => {
                  const active = pathname.endsWith(`/${href}`);
                  const cls = cn(
                    "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
                    enabled ? "hover:text-foreground" : "cursor-not-allowed opacity-45",
                  );
                  const inner = (
                    <>
                      {done ? <Check className="h-4 w-4 text-success" aria-label="Done" /> : <Icon className="hidden h-4 w-4 2xl:block" aria-hidden="true" />}
                      {label}
                    </>
                  );
                  return enabled ? (
                    <Link key={href} href={`/app/books/${bookId}/${href}`} className={cls} aria-current={active ? "page" : undefined}>
                      {inner}
                    </Link>
                  ) : (
                    <span key={href} className={cls} aria-disabled="true" title={hint ?? "Complete the previous step first"}>
                      {inner}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
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
