/** Typed fetch wrapper for the eBookStudio API (same-origin /api/v1). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
    /** Seconds the server asked us to wait before retrying (429). */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const REQUEST_TIMEOUT_MS = 60_000;

async function request<T>(method: Method, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: "include",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // A read that never answers would leave a spinner forever, so reads time
      // out. Writes do not: some run AI work for minutes, and giving up early
      // would invite a second, paid attempt while the first is still running.
      signal: method === "GET" ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "TIMEOUT", "The server took too long to answer. Check your connection and try again.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiError(
      res.status,
      err?.code ?? (res.status === 429 ? "RATE_LIMITED" : "UNKNOWN"),
      err?.message ?? (res.status === 429 ? "Too many requests." : `Request failed (${res.status})`),
      err?.details,
      err?.requestId ?? res.headers.get("x-request-id") ?? undefined,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", path, body ?? {}, headers),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "BAD_REQUEST" && Array.isArray(err.details) && err.details.length) {
      return (err.details as { message: string }[]).map((d) => d.message).join(". ");
    }
    if (err.status === 429) {
      const wait = err.retryAfter ? ` Try again in ${err.retryAfter < 60 ? `${Math.ceil(err.retryAfter)} seconds` : `${Math.ceil(err.retryAfter / 60)} minutes`}.` : " Please wait a moment and try again.";
      return `${err.message.replace(/\s*Please wait[^.]*\.?$/i, "")}${wait}`.trim();
    }
    if (err.status === 402) return `${err.message} You can add credits on the Credits page.`;
    return err.requestId && err.status >= 500 ? `${err.message} Support reference: ${err.requestId}` : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
