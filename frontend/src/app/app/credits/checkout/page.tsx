"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Alert, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

/**
 * The payment page (S12).
 *
 * The page is the customer's side of the payment. It never grants anything
 * itself: it asks the provider to settle the checkout, and the provider tells
 * the server over a signed webhook. A bookkeeper who edits the page cannot
 * grant credits, because the server only writes them when it has verified a
 * payment event.
 */

interface CheckoutDetails {
  session: string;
  providerPaymentId: string;
  planName: string;
  amountMinor: number;
  currency: string;
  credits: number;
}

function CheckoutInner() {
  const params = useSearchParams();
  const session = params.get("session") ?? "";
  const [problem, setProblem] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const details = useQuery({
    queryKey: ["local-provider-checkout", session],
    queryFn: () => api.get<CheckoutDetails>(`/local-provider/pay/${encodeURIComponent(session)}`),
    enabled: session !== "",
    retry: false,
  });

  const pay = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/local-provider/pay/${encodeURIComponent(session)}`),
    onSuccess: (result) => {
      if (result.status === "processed" || result.status === "ignored") setPaid(true);
      else setProblem(`The payment is ${result.status}.`);
    },
    onError: (err) => setProblem(errorMessage(err)),
  });

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState message="This checkout link is incomplete." />
      </div>
    );
  }
  if (details.isPending && !details.error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <PageLoader label="Opening the checkout…" />
      </div>
    );
  }
  if (details.error || !details.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState message={errorMessage(details.error)} onRetry={() => void details.refetch()} />
      </div>
    );
  }

  const checkout = details.data;
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card className="p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-hover">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Checkout</h1>
            <p className="text-sm text-muted-foreground">{checkout.planName}</p>
          </div>
        </div>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-medium">
              {new Intl.NumberFormat("en", { style: "currency", currency: checkout.currency }).format(checkout.amountMinor / 100)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Credits</dt>
            <dd className="font-medium">{formatNumber(checkout.credits)}</dd>
          </div>
        </dl>

        {paid ? (
          <Alert tone="success" className="mt-6">
            Payment confirmed. Your credits and capabilities are added once the server has verified the payment.
          </Alert>
        ) : (
          <>
            {problem && <Alert tone="danger" className="mt-6">{problem}</Alert>}
            <Button
              className="mt-6 w-full"
              loading={pay.isPending}
              onClick={() => {
                setProblem(null);
                pay.mutate();
              }}
              data-testid="pay-now"
            >
              Pay now
            </Button>
          </>
        )}

        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          This build talks to the local payment provider. It cannot take money, and no real payment is processed.
        </p>
      </Card>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening the checkout…" />}>
      <CheckoutInner />
    </Suspense>
  );
}
