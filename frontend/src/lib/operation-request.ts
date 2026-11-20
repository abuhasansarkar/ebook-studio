import { api, ApiError } from "./api";

const fallback = new Map<string, string>();

/** Keep one request identity across uncertain network responses, including refreshes.
 * Storage holds only a digest, random key and action path, never manuscript bodies.
 */
export async function operationRequest<T>(path: string, body: unknown = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const digest = crypto.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("") : null;
  // Plain HTTP LAN previews lack SubtleCrypto. Retain identity in memory there;
  // never put an unhashed payload into persistent browser storage.
  const slot = digest ? `ebook-operation:${path}:${digest}` : `${path}:${JSON.stringify(body)}`;
  let key = fallback.get(slot);
  try { if (digest) key = sessionStorage.getItem(slot) ?? key; } catch { /* In-memory fallback when browser storage is unavailable. */ }
  if (!key) key = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  fallback.set(slot, key);
  try { if (digest) sessionStorage.setItem(slot, key); } catch { /* The request still has an identity within this tab. */ }
  const clear = () => { fallback.delete(slot); try { if (digest) sessionStorage.removeItem(slot); } catch { /* No storage available. */ } };
  try {
    const result = await api.post<T>(path, body, { "Idempotency-Key": key });
    clear();
    return result;
  } catch (error) {
    // Retain the key when the outcome is uncertain. Explicit validation/permission/
    // credit failures can be corrected and submitted as a new intent.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.code !== "OPERATION_PENDING") clear();
    throw error;
  }
}
