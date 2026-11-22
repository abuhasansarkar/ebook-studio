import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { RETRY_MAX_MS, classifySaveError, retryDelayMs } from "../save-retry";

describe("classifySaveError", () => {
  it("treats a version conflict as a conflict", () => {
    expect(classifySaveError(new ApiError(409, "CONFLICT", "changed", { currentVersion: 3 }))).toEqual({ kind: "conflict" });
  });

  it.each([0, 408, 425, 429, 500, 502, 503, 504])("retries status %i", (status) => {
    expect(classifySaveError(new ApiError(status, "X", "x")).kind).toBe("retry");
  });

  it("retries network errors that are not ApiErrors", () => {
    expect(classifySaveError(new TypeError("Failed to fetch")).kind).toBe("retry");
  });

  it.each([400, 401, 403, 404, 413, 422])("does not retry status %i", (status) => {
    expect(classifySaveError(new ApiError(status, "X", "x")).kind).toBe("fatal");
  });

  it("passes Retry-After through in milliseconds", () => {
    expect(classifySaveError(new ApiError(429, "RATE_LIMITED", "slow down", undefined, undefined, 7))).toEqual({ kind: "retry", retryAfterMs: 7000 });
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially within the jitter window", () => {
    expect(retryDelayMs(1, undefined, () => 0)).toBe(500);
    expect(retryDelayMs(1, undefined, () => 1)).toBe(1000);
    expect(retryDelayMs(3, undefined, () => 1)).toBe(4000);
    expect(retryDelayMs(4, undefined, () => 0)).toBe(4000);
  });

  it("caps the delay", () => {
    expect(retryDelayMs(50, undefined, () => 1)).toBe(RETRY_MAX_MS);
  });

  it("honours Retry-After over the backoff, with an upper bound", () => {
    expect(retryDelayMs(1, 12_000)).toBe(12_000);
    expect(retryDelayMs(1, 10 * 60 * 60 * 1000)).toBe(RETRY_MAX_MS * 5);
  });
});
