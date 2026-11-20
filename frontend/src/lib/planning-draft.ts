import { bookBriefSchema, type BookBriefInput } from '@ebook/shared';
import { z } from 'zod';
const draftSchema = bookBriefSchema.partial().extend({ topic: z.string().max(1000).default('') });
async function store<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('ebook-planning-drafts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('drafts');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Planning storage blocked'));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export function planningDraftKey(owner: string) {
  let tab = sessionStorage.getItem('planning-tab');
  if (!tab) { tab = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'); sessionStorage.setItem('planning-tab', tab); }
  return `${owner}:${tab}`;
}
export async function readPlanningDraft(key: string): Promise<BookBriefInput | null> {
  const raw = await store<unknown>('readonly', s => s.get(key));
  if (raw === undefined) return null;
  return draftSchema.parse(raw);
}
export async function writePlanningDraft(key: string, value: BookBriefInput) { await store('readwrite', s => s.put(value, key)); }
export async function deletePlanningDraft(key: string) { await store('readwrite', s => s.delete(key)); }
