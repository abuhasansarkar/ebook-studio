import { documentError } from "@ebook/shared";

/** Local recovery data is scoped to the signed-in owner and chapter. Each editor
 * instance has its own record so two tabs cannot overwrite each other's work. */
export interface DraftRecord {
  id: string;
  ownerId: string;
  chapterId: string;
  baseVersion: number;
  updatedAt: number;
  patch: { title?: string; contentJson?: Record<string, unknown> };
}

/** Whether a stored record is a usable draft for this owner and chapter. */
export function isValidDraft(r: unknown, ownerId: string, chapterId: string): r is DraftRecord {
  if (!r || typeof r !== 'object') return false;
  const d = r as Partial<DraftRecord>;
  if (typeof d.id !== 'string' || d.ownerId !== ownerId || d.chapterId !== chapterId) return false;
  if (!Number.isSafeInteger(d.baseVersion) || (d.baseVersion as number) < 0 || !Number.isFinite(d.updatedAt)) return false;
  const patch = d.patch;
  if (!patch || typeof patch !== 'object') return false;
  if (patch.title !== undefined && typeof patch.title !== 'string') return false;
  try {
    if (patch.contentJson !== undefined && documentError(patch.contentJson)) return false;
  } catch { return false; }
  return true;
}

/** Valid drafts, newest first. Damaged records are skipped (and left in place)
 * so one bad record cannot hide every other recoverable draft. */
export function usableDrafts(records: unknown[], ownerId: string, chapterId: string): DraftRecord[] {
  const usable = records.filter((r): r is DraftRecord => isValidDraft(r, ownerId, chapterId));
  if (usable.length !== records.length) console.warn(`Skipped ${records.length - usable.length} damaged browser draft(s).`);
  return usable.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ebook-drafts', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('drafts', { keyPath: 'id' });
      store.createIndex('ownerChapter', ['ownerId', 'chapterId']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser draft storage is blocked'));
  });
}

export async function readDrafts(ownerId: string, chapterId: string): Promise<DraftRecord[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const request = tx.objectStore('drafts').index('ownerChapter').getAll([ownerId, chapterId]);
      tx.oncomplete = () => {
        resolve(usableDrafts(request.result as unknown[], ownerId, chapterId));
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function writeDraft(record: DraftRecord): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function removeDraft(id: string, updatedAt?: number): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(id);
      request.onsuccess = () => {
        // A still-open tab may have advanced the recovered draft since we read it.
        if (request.result && (updatedAt === undefined || request.result.updatedAt === updatedAt)) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
