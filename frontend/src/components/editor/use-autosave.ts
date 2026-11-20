"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readDrafts, writeDraft, removeDraft, type DraftRecord } from "@/lib/draft-journal";
import { api, ApiError } from "@/lib/api";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "offline";

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
    if (inFlight.current) { await inFlight.current; return; }
    if (blocked.current) return;
    const payload = pending.current;
    if (!payload) return;
    if (!navigator.onLine) { setState('offline'); return; }
    pending.current = null;
    activePayload.current = payload;
    setState("saving");

    const run = api
      .patch<{ chapter: SavedChapter }>(`/chapters/${chapterId}`, { ...payload, version: versionRef.current })
      .then(({ chapter }) => {
        versionRef.current = chapter.version;
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
      })
      .catch((err: unknown) => {
        // Keep the unsaved changes; newer edits win over the failed payload.
        pending.current = { ...payload, ...pending.current };
        if (err instanceof ApiError && err.status === 409 && err.details) {
          blocked.current = true;
          setConflict(err.details as ConflictInfo);
          setState("conflict");
        } else {
          setErrorMsg(err instanceof Error ? err.message : "Save failed");
          blocked.current = true;
          setState(navigator.onLine ? "error" : "offline");
        }
        journal({ ...activePayload.current, ...pending.current }, versionRef.current);
      })
      .finally(() => {
        activePayload.current = null;
        inFlight.current = null;
      });
    inFlight.current = run;
    await run;
    // Edits made while this save was in flight get their own save.
    if (mounted.current && !blocked.current && pending.current && !timer.current) {
      timer.current = setTimeout(() => void flushRef.current(), delay);
    }
  }, [chapterId, delay, journal]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (patch: ChapterPatch) => {
      pending.current = { ...pending.current, ...patch };
      journal({ ...activePayload.current, ...pending.current }, versionRef.current);
      if (blocked.current) return;
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

  // Never start an untracked HTTP write during unmount. The journal survives navigation.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
      const target = event.target instanceof Element ? event.target.closest('a[href], [data-editor-navigation]') : null;
      if (target && (pending.current || inFlight.current) && !window.confirm('This chapter has unsaved changes. Leave and recover the browser draft later? If browser recovery is unavailable, download a backup first.')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener('click', navigation, true);
    return () => { window.removeEventListener("beforeunload", handler); document.removeEventListener('click', navigation, true); };
  }, []);

  // History is opened only when saved, and editing stays paused until it closes.
  const adoptRestored = useCallback((saved: SavedChapter) => {
    versionRef.current = saved.version;
    setLastSavedAt(new Date(saved.updatedAt));
    setState("saved");
    setConflict(null);
    setErrorMsg(null);
  }, []);

  return { ready, drafts, recover, discardDrafts, storageError, retry, state, lastSavedAt, conflict, errorMsg, schedule, flush, resolveKeepMine, resolveTakeTheirs, adoptRestored };
}
