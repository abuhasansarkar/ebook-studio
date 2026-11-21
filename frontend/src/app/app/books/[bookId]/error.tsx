"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * The error boundary for a single book.
 *
 * It sits inside the app shell, so the navigation and the author's credit
 * balance stay on screen. That matters most for the editor: a crash inside
 * the editor must not take the shell down with it, because the editor's
 * IndexedDB draft journal is keyed to the chapter and owner and stays
 * recoverable as long as the author can navigate back to that chapter.
 */
export default function BookError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Book route failed", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        role="alert"
        className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-danger/25 bg-danger-soft/40 px-6 py-12"
      >
        <AlertTriangle className="mb-3 h-9 w-9 text-danger" aria-hidden />
        <h1 className="text-lg font-semibold">This part of your book could not be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your manuscript is stored on the server, and any unsaved edits remain in this browser. Nothing has
          been discarded.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/app/books"
            className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Back to my eBooks
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference code <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
