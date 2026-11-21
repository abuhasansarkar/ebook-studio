"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Library } from "lucide-react";

/**
 * The error boundary for the studio.
 *
 * The rule this file exists to enforce: an author must never lose manuscript
 * work to a rendering crash. The editor keeps an IndexedDB journal of unsaved
 * edits, so a crash that unmounts the tree does not destroy the draft — but
 * the author has to be told that, and given a way back that does not lose it.
 *
 * The boundary therefore:
 * - explains that the draft is still held locally, and is not lost;
 * - offers a retry that re-renders the same route;
 * - offers a route back to the library, which does not clear the journal;
 * - never claims the work was saved.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server logs the same failure with its own correlation id. This keeps
    // the browser copy without inventing a second identity for it.
    console.error("Studio route failed", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        role="alert"
        className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-danger/25 bg-danger-soft/40 px-6 py-12"
      >
        <AlertTriangle className="mb-3 h-9 w-9 text-danger" aria-hidden />
        <h1 className="text-lg font-semibold">This screen ran into a problem</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page could not be drawn. Anything you were editing is still held in this browser and has not
          been discarded — you can come back to it.
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
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Library className="h-4 w-4" aria-hidden />
            Back to my eBooks
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference code <span className="font-mono">{error.digest}</span> — quote this if you contact support.
          </p>
        ) : null}
      </div>
    </div>
  );
}
