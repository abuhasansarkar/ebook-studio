"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface ChapterPatch {
  title?: string;
  contentJson?: Record<string, unknown>;
}

export interface ConflictInfo {
  currentVersion: number;
  updatedAt: string;
  title: string;
  contentJson: Record<string, unknown> | null;
}

export interface SavedChapter {
  id: string;
  title: string;
  version: number;
  wordCount: number;
  status: string;
  updatedAt: string;
}

/**
 * Debounced autosave with optimistic concurrency.
 * - Saves are serialized (never two PATCHes in flight for the same chapter).
 * - Every PATCH carries the last known server `version`; a 409 surfaces a conflict
 *   instead of silently overwriting changes from another tab or device.
 */
export function useAutosave(chapterId: string, initialVersion: number, initialSavedAt: string, onSaved: (c: SavedChapter, saved: ChapterPatch) => void, delay = 1200) {
  const versionRef = useRef(initialVersion);
  const pending = useRef<ChapterPatch | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const [state, setState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date>(new Date(initialSavedAt));
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      await inFlight.current;
    }
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    setState("saving");

    const run = api
      .patch<{ chapter: SavedChapter }>(`/chapters/${chapterId}`, { ...payload, version: versionRef.current })
      .then(({ chapter }) => {
        versionRef.current = chapter.version;
        setLastSavedAt(new Date(chapter.updatedAt));
        setErrorMsg(null);
        setState(pending.current ? "dirty" : "saved");
        onSavedRef.current(chapter, payload);
      })
      .catch((err: unknown) => {
        // Keep the unsaved changes; newer edits win over the failed payload.
        pending.current = { ...payload, ...pending.current };
        if (err instanceof ApiError && err.status === 409 && err.details) {
          setConflict(err.details as ConflictInfo);
          setState("conflict");
        } else {
          setErrorMsg(err instanceof Error ? err.message : "Save failed");
          setState("error");
        }
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    await run;
    // Edits made while this save was in flight get their own save.
    if (pending.current && !timer.current) {
      timer.current = setTimeout(() => void flushRef.current(), delay);
    }
  }, [chapterId, delay]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (patch: ChapterPatch) => {
      pending.current = { ...pending.current, ...patch };
      setState((s) => (s === "conflict" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  /** Overwrite the server copy with ours (user chose "keep mine"). */
  const resolveKeepMine = useCallback(
    (full: ChapterPatch) => {
      if (!conflict) return;
      versionRef.current = conflict.currentVersion;
      setConflict(null);
      pending.current = { ...pending.current, ...full };
      void flush();
    },
    [conflict, flush],
  );

  /** Discard local edits and adopt the server copy. Returns it for the editor to load. */
  const resolveTakeTheirs = useCallback(() => {
    if (!conflict) return null;
    const theirs = conflict;
    versionRef.current = theirs.currentVersion;
    pending.current = null;
    setConflict(null);
    setState("saved");
    setLastSavedAt(new Date(theirs.updatedAt));
    return theirs;
  }, [conflict]);

  // Save whatever is pending when the editor unmounts (chapter switch / navigation).
  useEffect(() => {
    return () => {
      if (pending.current) void flush();
    };
  }, [flush]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // History is opened only when saved, and editing stays paused until it closes.
  const adoptRestored = useCallback((saved: SavedChapter) => {
    versionRef.current = saved.version;
    setLastSavedAt(new Date(saved.updatedAt));
    setState("saved");
    setConflict(null);
    setErrorMsg(null);
  }, []);

  return { state, lastSavedAt, conflict, errorMsg, schedule, flush, resolveKeepMine, resolveTakeTheirs, adoptRestored };
}
