import { ApiError } from "./api";

/**
 * How autosave reacts to a failed PATCH.
 * - `conflict`: another tab/device saved first; the user must choose a version.
 * - `retry`: transient (network, timeout, 408/425/429, 5xx); try again later.
 * - `fatal`: the request itself is wrong (other 4xx); retrying cannot help.
 */
export type SaveFailure =
  | { kind: "conflict" }
  | { kind: "retry"; retryAfterMs?: number }
  | { kind: "fatal" };

export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;

export function classifySaveError(err: unknown): SaveFailure {
  if (!(err instanceof ApiError)) return { kind: "retry" };
  if (err.status === 409) return { kind: "conflict" };
  const retryAfterMs = err.retryAfter ? err.retryAfter * 1000 : undefined;
  if (err.status === 0 || err.status === 408 || err.status === 425 || err.status === 429 || err.status >= 500) {
    return { kind: "retry", retryAfterMs };
  }
  return { kind: "fatal" };
}

/**
 * Delay before retry number `attempt` (1-based): exponential backoff with
 * jitter, capped. A server-provided Retry-After always wins (also capped, so a
 * huge value cannot park autosave for hours).
 */
export function retryDelayMs(attempt: number, retryAfterMs?: number, random: () => number = Math.random): number {
  if (retryAfterMs !== undefined && retryAfterMs > 0) return Math.min(retryAfterMs, RETRY_MAX_MS * 5);
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
  // Full jitter on the upper half so many tabs do not retry in lockstep.
  return Math.round(exp / 2 + random() * (exp / 2));
}
