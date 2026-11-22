import { bookBriefSchema, type BookBriefInput } from '@ebook/shared';
import { z } from 'zod';

/**
 * Unfinished book briefs, kept in IndexedDB so a crash or a closed tab does not
 * lose them.
 *
 * Like the chapter draft journal, every tab writes its own record (so two tabs
 * cannot overwrite each other), but records are found by owner and scope rather
 * than by tab: a new tab or a restarted browser still sees them. Records older
 * than {@link PLANNING_DRAFT_MAX_AGE_MS} are removed when drafts are listed.
 */
const draftSchema = bookBriefSchema.partial().extend({ topic: z.string().max(1000).default('') });

export const PLANNING_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_PLANNING_SCOPE = 'new-book';

export interface PlanningDraft {
  key: string;
  ownerId: string;
  scope: string;
  updatedAt: number;
  value: BookBriefInput;
}

interface StoredDraft { v: 2; ownerId: string; scope: string; updatedAt: number; value: unknown }

export function planningDraftKey(owner: string, scope = DEFAULT_PLANNING_SCOPE, tab = tabId()) {
  return `${owner}:${scope}:${tab}`;
}

function tabId(): string {
  let tab = sessionStorage.getItem('planning-tab');
  if (!tab) { tab = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'); sessionStorage.setItem('planning-tab', tab); }
  return tab;
}

/**
 * Interprets one stored record. Version-1 records (`owner:tab` → raw brief, no
 * timestamp) are read as drafts of the default scope and flagged as legacy so
 * the caller can rewrite them in the current format. Returns null for records
 * that are damaged or belong to someone else.
 */
export function parseStoredPlanningDraft(key: string, raw: unknown, owner: string, now = Date.now()): (PlanningDraft & { legacy: boolean }) | null {
  if (!key.startsWith(`${owner}:`)) return null;
  const stored = raw as Partial<StoredDraft> | null;
  if (stored && typeof stored === 'object' && stored.v === 2) {
    if (stored.ownerId !== owner || typeof stored.scope !== 'string' || !Number.isFinite(stored.updatedAt)) return null;
    const value = draftSchema.safeParse(stored.value);
    if (!value.success) return null;
    return { key, ownerId: owner, scope: stored.scope, updatedAt: stored.updatedAt as number, value: value.data as BookBriefInput, legacy: false };
  }
  // Legacy keys have exactly two parts: owner and tab id.
  if (key.slice(owner.length + 1).includes(':')) return null;
  const value = draftSchema.safeParse(raw);
  if (!value.success) return null;
  return { key, ownerId: owner, scope: DEFAULT_PLANNING_SCOPE, updatedAt: now, value: value.data as BookBriefInput, legacy: true };
}

export function isExpiredPlanningDraft(raw: unknown, now = Date.now()): boolean {
  const stored = raw as Partial<StoredDraft> | null;
  return !!stored && typeof stored === 'object' && stored.v === 2 && Number.isFinite(stored.updatedAt) && now - (stored.updatedAt as number) > PLANNING_DRAFT_MAX_AGE_MS;
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ebook-planning-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Planning storage blocked'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const result = run(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(result());
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/**
 * Every recoverable draft of this owner and scope, newest first. Expired records
 * (of any owner on this device) are deleted, and legacy records are migrated to
 * the current format, in the same transaction.
 */
export async function listPlanningDrafts(owner: string, scope = DEFAULT_PLANNING_SCOPE, now = Date.now()): Promise<PlanningDraft[]> {
  return transaction('readwrite', (store) => {
    const found: PlanningDraft[] = [];
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const key = String(c.key);
      if (isExpiredPlanningDraft(c.value, now)) {
        c.delete();
      } else {
        const draft = parseStoredPlanningDraft(key, c.value, owner, now);
        if (draft?.legacy) {
          const migrated = planningDraftKey(owner, DEFAULT_PLANNING_SCOPE, key.slice(owner.length + 1));
          store.put({ v: 2, ownerId: owner, scope: DEFAULT_PLANNING_SCOPE, updatedAt: now, value: draft.value } satisfies StoredDraft, migrated);
          c.delete();
          if (scope === DEFAULT_PLANNING_SCOPE) found.push({ key: migrated, ownerId: owner, scope, updatedAt: now, value: draft.value });
        } else if (draft && draft.scope === scope) {
          found.push({ key: draft.key, ownerId: draft.ownerId, scope: draft.scope, updatedAt: draft.updatedAt, value: draft.value });
        }
      }
      c.continue();
    };
    return () => found.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export async function writePlanningDraft(key: string, value: BookBriefInput, owner: string, scope = DEFAULT_PLANNING_SCOPE) {
  await transaction('readwrite', (store) => {
    store.put({ v: 2, ownerId: owner, scope, updatedAt: Date.now(), value } satisfies StoredDraft, key);
    return () => undefined;
  });
}

export async function deletePlanningDrafts(keys: string[]) {
  if (!keys.length) return;
  await transaction('readwrite', (store) => {
    for (const key of new Set(keys)) store.delete(key);
    return () => undefined;
  });
}
