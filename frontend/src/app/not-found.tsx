import Link from "next/link";
import { FileQuestion } from "lucide-react";

/**
 * The 404 page.
 *
 * A lost book is the common case, so the page offers the library rather than
 * leaving the author at a dead end.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12">
        <FileQuestion className="mb-3 h-9 w-9 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">We could not find that page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the book may have been deleted. Your other books are still where you left
          them.
        </p>
        <Link
          href="/app/books"
          className="mt-6 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Go to my eBooks
        </Link>
      </div>
    </div>
  );
}
