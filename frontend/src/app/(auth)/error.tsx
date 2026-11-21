"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * The error boundary for the sign-in and sign-up screens.
 *
 * An auth failure is often the user's own credentials, so the page stays
 * neutral: it does not say whether an account exists.
 */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Auth route failed", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col items-center rounded-2xl border border-danger/25 bg-danger-soft/40 px-6 py-12"
      >
        <AlertTriangle className="mb-3 h-9 w-9 text-danger" aria-hidden />
        <h1 className="text-lg font-semibold">We could not complete that</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The request could not be finished. Please check your connection and try again.
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
            href="/login"
            className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
