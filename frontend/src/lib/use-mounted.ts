"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the component has mounted in the browser.
 *
 * A screen that depends on client-only state — a query cache, a viewport, a
 * stored preference — renders differently on the server than it does after the
 * first client render. That difference is a hydration mismatch, which React
 * reports as an error and papers over by rebuilding the tree.
 *
 * Waiting for the mount before showing the client-only state keeps the server
 * markup and the first client render identical, so the page hydrates cleanly
 * and then fills in.
 *
 * `useSyncExternalStore` is the sanctioned way to read this: it reports the
 * server snapshot during the server render and the client snapshot after the
 * hydration, without an effect that would trigger a second render.
 */
const noopSubscribe = () => () => {};

/** The client snapshot: true once the component is in the browser. */
const clientSnapshot = () => true;

/** The server snapshot: false, because the server has no window. */
const serverSnapshot = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}
