"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readDrafts, writeDraft, removeDraft, type DraftRecord } from "@/lib/draft-journal";
import { api, errorMessage } from "@/lib/api";
import { classifySaveError, retryDelayMs } from "@/lib/save-retry";

/**
 * - `retrying`: a transient failure (network, timeout, 429, 5xx); autosave retries
 *   on its own with exponential backoff, edits keep being journaled meanwhile.
 * - `error`: a non-retryable failure; autosave is paused until the user retries.
 * - `conflict`: the server copy changed elsewhere; the user must pick a version.
 */
export type SaveState = "saved" | "dirty" | "saving" | "retrying" | "error" | "conflict" | "offline";

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
 * - Transient failures retry automatically (see lib/save-retry); only conflicts and
 *   non-retryable 4xx responses pause autosave.
 */
export function useAutosave(ownerId: string, chapterId: string, initialVersion: number, initialSavedAt: string, onSaved: (c: SavedChapter, saved: ChapterPatch) => void, delay = 1200) {
  const blocked = useRef(false);
  const mounted = useRef(true);
  const draftId = useRef<string | null>(null);
  const recovered = useRef<DraftRecord | null>(null);
  const journalQueue = useRef<Promise<void>>(Promise.resolve());
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const journal = useCallback((patch: ChapterPatch | null, baseVersion: number) => {
    if (!draftId.current) draftId.current = `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}`;
    const id = draftId.current;
    const record = patch ? { id, ownerId, chapterId, baseVersion, updatedAt: Date.now(), patch: structuredClone(patch) } : null;
    journalQueue.current = journalQueue.current.then(async () => {
      if (record) await writeDraft(record);
      else await removeDraft(id);
      if (mounted.current) setStorageError(null);
    }).catch(() => {
      if (mounted.current) setStorageError('Browser recovery is unavailable. Keep this tab open until your changes are saved, or download a backup.');
    });
  }, [ownerId, chapterId]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void readDrafts(ownerId, chapterId).then(records => { if (active) setDrafts(records); }).catch(() => {
      if (active) setStorageError('Browser recovery is unavailable. Keep this tab open until your changes are saved, or download a backup.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; mounted.current = false; };
  }, [ownerId, chapterId]);
  const versionRef = useRef(initialVersion);
  const pending = useRef<ChapterPatch | null>(null);
  const activePayload = useRef<ChapterPatch | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const onSavedRef = useRef(onSaved);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const [state, setState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date>(new Date(initialSavedAt));
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  /** Saves the pending patch now. Resolves `false` if the save did not succeed. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (inFlight.current) return inFlight.current;
    if (blocked.current) return false;
    const payload = pending.current;
    if (!payload) return true;
    if (!navigator.onLine) { setState('offline'); return false; }
    pending.current = null;
    activePayload.current = payload;
    setState("saving");

    const run = api
      .patch<{ chapter: SavedChapter }>(`/chapters/${chapterId}`, { ...payload, version: versionRef.current })
      .then(({ chapter }) => {
        versionRef.current = chapter.version;
        attempts.current = 0;
        setLastSavedAt(new Date(chapter.updatedAt));
        setErrorMsg(null);
        setState(pending.current ? "dirty" : "saved");
        journal(pending.current, chapter.version);
        if (recovered.current) {
          const old = recovered.current;
          recovered.current = null;
          journalQueue.current = journalQueue.current.then(() => removeDraft(old.id, old.updatedAt)).catch(() => undefined);
        }
        onSavedRef.current(chapter, payload);
        return true;
      })
      .catch((err: unknown) => {
        // Keep the unsaved changes; newer edits win over the failed payload.
        pending.current = { ...payload, ...pending.current };
        const failure = classifySaveError(err);
        const details = failure.kind === "conflict" ? (err as { details?: unknown }).details : undefined;
        if (details) {
          blocked.current = true;
          setConflict(details as ConflictInfo);
          setState("conflict");
        } else if (failure.kind === "retry") {
          attempts.current += 1;
          setErrorMsg(errorMessage(err));
          // A debounce set by edits typed during this save must not undercut the backoff.
          if (timer.current) { clearTimeout(timer.current); timer.current = null; }
          if (!navigator.onLine) {
            // The `online` listener resumes saving once the connection is back.
            setState("offline");
          } else {
            setState("retrying");
            if (mounted.current) {
              retryTimer.current = setTimeout(() => {
                retryTimer.current = null;
                void flushRef.current();
              }, retryDelayMs(attempts.current, failure.retryAfterMs));
            }
          }
        } else {
          setErrorMsg(errorMessage(err));
          blocked.current = true;
          setState("error");
        }
        journal({ ...activePayload.current, ...pending.current }, versionRef.current);
        return false;
      })
      .finally(() => {
        activePayload.current = null;
        inFlight.current = null;
      });
    inFlight.current = run;
    const ok = await run;
    // Edits made while this save was in flight get their own save.
    if (mounted.current && !blocked.current && pending.current && !timer.current && !retryTimer.current) {
      timer.current = setTimeout(() => void flushRef.current(), delay);
    }
    return ok;
  }, [chapterId, delay, journal]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (patch: ChapterPatch) => {
      pending.current = { ...pending.current, ...patch };
      journal({ ...activePayload.current, ...pending.current }, versionRef.current);
      if (blocked.current) return;
      // Waiting out a backoff: the scheduled retry will carry this edit too.
      if (retryTimer.current) return;
      setState(navigator.onLine ? 'dirty' : 'offline');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush, journal],
  );

  /** Overwrite the server copy with ours (user chose "keep mine"). */
  const resolveKeepMine = useCallback(
    (full: ChapterPatch) => {
      if (!conflict) return;
      versionRef.current = conflict.currentVersion;
      setConflict(null);
      blocked.current = false;
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
    blocked.current = false;
    journal(null, theirs.currentVersion);
    if (recovered.current) {
      const old = recovered.current;
      recovered.current = null;
      journalQueue.current = journalQueue.current.then(() => removeDraft(old.id, old.updatedAt)).catch(() => undefined);
    }
    setConflict(null);
    setState("saved");
    setLastSavedAt(new Date(theirs.updatedAt));
    return theirs;
  }, [conflict, journal]);

  /**
   * Saves until nothing is pending (edits typed while a save is in flight get
   * their own save). Resolves `true` only when everything reached the server.
   * Used before switching chapters inside the editor.
   */
  const flushAll = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < 10; i += 1) {
      if (!pending.current && !inFlight.current) return true;
      if (!(await flushRef.current())) return false;
    }
    return !pending.current && !inFlight.current;
  }, []);

  // Never start an untracked HTTP write during unmount. The journal survives navigation.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const retry = useCallback(async () => {
    if (conflict) return;
    blocked.current = false;
    await flush();
  }, [conflict, flush]);
  useEffect(() => {
    const online = () => { if (!blocked.current) void flush(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);
  const recover = useCallback((draft: DraftRecord) => {
    recovered.current = draft;
    versionRef.current = draft.baseVersion;
    pending.current = draft.patch;
    journal(draft.patch, draft.baseVersion);
    setDrafts([]);
    setState('dirty');
    // Even a matching version requires an explicit Save after review.
    return draft.patch;
  }, [journal]);
  const discardDrafts = useCallback(async () => {
    try {
      await Promise.all(drafts.map(d => removeDraft(d.id, d.updatedAt)));
      setDrafts([]);
    } catch { setStorageError('Could not remove browser drafts. Please try again.'); }
  }, [drafts]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
      }
    };
    const navigation = (event: MouseEvent) => {
      if (!(pending.current || inFlight.current) || !(event.target instanceof Element)) return;
      const target = event.target.closest('a[href], [data-editor-navigation]');
      if (!target || leavesNothing(target, event)) return;
      if (window.confirm('This chapter has unsaved changes. Leave and recover the browser draft later? If browser recovery is unavailable, download a backup first.')) {
        // Best effort: the journal still holds the draft if this save does not land.
        void flushRef.current();
      } else {
        event.preventDefault(); event.stopPropagation();
      }
    };
    // Browser Back/Forward cannot be cancelled in the App Router; start the save
    // so it usually lands, while the journal keeps the draft if it does not.
    const popstate = () => { if (pending.current) void flushRef.current(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("popstate", popstate);
    document.addEventListener('click', navigation, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("popstate", popstate);
      document.removeEventListener('click', navigation, true);
    };
  }, []);

  // History is opened only when saved, and editing stays paused until it closes.
  const adoptRestored = useCallback((saved: SavedChapter) => {
    versionRef.current = saved.version;
    setLastSavedAt(new Date(saved.updatedAt));
    setState("saved");
    setConflict(null);
    setErrorMsg(null);
  }, []);

  return { ready, drafts, recover, discardDrafts, storageError, retry, state, lastSavedAt, conflict, errorMsg, schedule, flush, flushAll, resolveKeepMine, resolveTakeTheirs, adoptRestored };
}

/** Clicks that do not leave the chapter: links inside the document being edited,
 * new-tab/download links, modified clicks and same-page anchors. */
function leavesNothing(target: Element, event: MouseEvent): boolean {
  if (target.closest('.ProseMirror')) return true;
  if (target instanceof HTMLAnchorElement) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return true;
    if (target.target === '_blank' || target.hasAttribute('download')) return true;
    if (target.getAttribute('href')?.startsWith('#')) return true;
  }
  return false;
}
