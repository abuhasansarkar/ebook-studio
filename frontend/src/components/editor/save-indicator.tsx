"use client";

import { useEffect, useState } from "react";
import { Check, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "offline";

/**
 * The editor's save status.
 *
 * The visible label is not enough on its own: a screen-reader user is typing
 * in the editor, so the focus never moves to this text and a change from
 * "Saving…" to "Saved" would be silent. The status is therefore also
 * announced through a polite live region.
 *
 * "Polite" rather than "assertive" is deliberate. A save happens after the
 * author stops typing, and an assertive announcement would interrupt whatever
 * the screen reader was saying. Errors are announced through a separate
 * assertive region, because a failure needs to be noticed now.
 */
export function SaveIndicator({ state, lastSavedAt, error, onRetry }: { state: SaveState; lastSavedAt: Date; error: string | null; onRetry: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const message =
    state === "saving" ? "Saving" :
    state === "dirty" ? "Unsaved changes" :
    state === "conflict" ? "Edit conflict" :
    state === "offline" ? "Offline, changes pending" :
    state === "error" ? "Not saved" :
    `Saved ${timeAgo(lastSavedAt)}`;

  const visible = (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>}
      {state === "dirty" && <>Unsaved changes</>}
      {state === "conflict" && <><AlertTriangle className="h-3.5 w-3.5 text-warning" /> Edit conflict</>}
      {(state === "error" || state === "offline") && (
        <>
          <CloudOff className="h-3.5 w-3.5 text-danger" /> {state === "offline" ? "Offline — changes pending" : "Not saved"}
          <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">Retry</button>
        </>
      )}
      {state === "saved" && <><Check className="h-3.5 w-3.5 text-success" /> Saved {timeAgo(lastSavedAt)}</>}
    </span>
  );

  return (
    <>
      {visible}
      {/* The announcement carries the same text, but only the words a screen
          reader needs to hear. */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{message}</span>
      {(state === "error" || state === "conflict") && (
        <span role="alert" className="sr-only">{error ?? (state === "conflict" ? "This chapter was changed elsewhere. Choose which version to keep." : "The chapter could not be saved.")}</span>
      )}
    </>
  );
}
