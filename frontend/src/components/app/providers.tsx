"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";

function AccountCacheBoundary({ client }: { client: QueryClient }) {
  const { data: session, isPending } = useSession();
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
