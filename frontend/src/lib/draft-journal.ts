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
        const records = request.result as DraftRecord[];
        if (records.some(r => !r || typeof r.id !== 'string' || r.ownerId !== ownerId || r.chapterId !== chapterId || !Number.isSafeInteger(r.baseVersion) || r.baseVersion < 0 || !Number.isFinite(r.updatedAt) || !r.patch || (r.patch.title !== undefined && typeof r.patch.title !== 'string') || (r.patch.contentJson !== undefined && documentError(r.patch.contentJson)))) {
          reject(new Error('A browser draft is damaged')); return;
        }
        resolve(records.sort((a, b) => b.updatedAt - a.updatedAt));
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
