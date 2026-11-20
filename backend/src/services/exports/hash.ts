import { createHash } from 'node:crypto';

/**
 * Deterministic hashing of export inputs.
 *
 * Kept free of database imports so it can be used by the database-free checks
 * as well as by the worker.
 */

/** JSON with object keys sorted, so equal content always produces the same hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Stable hash of the chapters an export renders.
 *
 * The hash changes when the manuscript changes, which is how the export screen
 * detects that a finished export is older than the current manuscript.
 */
export function contentHash(chapters: { id: string; version: number; content: unknown }[]): string {
  const hash = createHash('sha256');
  for (const chapter of chapters) {
    hash.update(chapter.id);
    hash.update(`\u0000${chapter.version}\u0000`);
    hash.update(stableStringify(chapter.content));
    hash.update('\u0001');
  }
  return hash.digest('hex');
}
