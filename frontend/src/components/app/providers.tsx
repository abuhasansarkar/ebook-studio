"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";

/**
 * A 401 from the API means the session ended (expired, or signed out in
 * another tab). The session is re-checked, and the app shell then sends the
 * author to log in with their place kept. Throttled so a page full of failing
 * queries checks once.
 */
let recheckSession: (() => void) | null = null;
let lastRecheck = 0;
function onApiError(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 401) return;
  const now = Date.now();
  if (now - lastRecheck < 10_000) return;
  lastRecheck = now;
  recheckSession?.();
}

function AccountCacheBoundary({ client }: { client: QueryClient }) {
  const { data: session, isPending, refetch } = useSession();
  useLayoutEffect(() => {
    recheckSession = () => void refetch();
    return () => { recheckSession = null; };
  }, [refetch]);
  const previous = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (isPending) return;
    const owner = session?.user.id ?? null;
    if (previous.current !== undefined && previous.current !== owner) client.clear();
    previous.current = owner;
  }, [client, isPending, session?.user.id]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onApiError }),
        mutationCache: new MutationCache({ onError: onApiError }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // Don't hammer the API on auth/permission/not-found errors.
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AccountCacheBoundary client={client} />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
