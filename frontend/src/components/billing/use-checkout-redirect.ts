"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckoutSession } from "@/lib/types";
import { useStartCheckout } from "@/lib/queries";

/** If navigation has not happened by then (blocked pop-up, same-page URL), the buttons unlock. */
const REDIRECT_LOCK_MS = 20_000;

/**
 * Starts a checkout and follows the provider's redirect URL.
 *
 * The mutation settles as soon as the API answers, but the browser needs a
 * moment longer to leave the page. Without a separate "redirecting" flag the
 * buy buttons re-enable in between, and a second click starts a second
 * checkout. So the lock (a ref, immune to a double click inside one render)
 * holds from the click until the page is left.
 */
export function useCheckoutRedirect() {
  const router = useRouter();
  const checkout = useStartCheckout();
  const lock = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null);

  const unlock = useCallback(() => {
    lock.current = false;
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = null;
    setRedirectingTo(null);
  }, []);

  useEffect(() => {
    // Coming back from the provider with the Back button restores this page
    // from the back/forward cache with the lock still set.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) unlock(); };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    };
  }, [unlock]);

  const start = useCallback(
    (planId: string, handlers: { onError?: (err: unknown) => void; onNoRedirect?: (checkout: CheckoutSession) => void } = {}) => {
      if (lock.current) return;
      lock.current = true;
      checkout.mutate(planId, {
        onSuccess: (result) => {
          const url = result.checkout?.url;
          if (!url) {
            unlock();
            handlers.onNoRedirect?.(result.checkout);
            return;
          }
          setRedirectingTo(planId);
          unlockTimer.current = setTimeout(unlock, REDIRECT_LOCK_MS);
          if (url.startsWith("http://") || url.startsWith("https://")) window.location.assign(url);
          else router.push(url);
        },
        onError: (err) => {
          unlock();
          handlers.onError?.(err);
        },
      });
    },
    [checkout, router, unlock],
  );

  /** The plan whose checkout is starting or redirecting, if any. */
  const pendingPlanId = redirectingTo ?? (checkout.isPending ? (checkout.variables ?? null) : null);
  return { start, pendingPlanId, busy: pendingPlanId !== null };
}
