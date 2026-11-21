"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { CREDIT_COSTS } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Section } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useCredits } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";

const TYPE_LABEL = { grant: "Added", reserve: "Reserved", charge: "Used", release: "Returned", refund: "Refunded" } as const;

/**
 * What happened at the payment processor, after it sends the customer back.
 *
 * The processor's redirect only says the customer finished its page; the
 * credits arrive when its verified payment event does. So a success return
 * shows "being confirmed" and polls the balance until it moves.
 */
function CheckoutReturnNotice({ balance, refetch }: { balance: number | undefined; refetch: () => void }) {
  const [outcome, setOutcome] = useState<"success" | "cancelled" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const startBalance = useRef<number | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout !== "success" && checkout !== "cancelled") return;
    // Read once, then drop it from the address so a reload doesn't repeat it.
    queueMicrotask(() => setOutcome(checkout));
    params.delete("checkout");
    params.delete("session_id");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    if (outcome !== "success" || confirmed) return;
    if (startBalance.current === undefined && balance !== undefined) startBalance.current = balance;
    if (startBalance.current !== undefined && balance !== undefined && balance > startBalance.current) {
      queueMicrotask(() => setConfirmed(true));
      return;
    }
    const timer = setInterval(refetch, 3000);
    const stop = setTimeout(() => clearInterval(timer), 90_000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [outcome, confirmed, balance, refetch]);

  if (outcome === "cancelled") return <Alert tone="info" className="mb-6">Checkout cancelled. You haven&apos;t been charged.</Alert>;
  if (outcome === "success" && confirmed) return <Alert tone="success" className="mb-6">Payment confirmed. Your credits have been added.</Alert>;
  if (outcome === "success") {
    return (
      <Alert tone="info" className="mb-6" >
        <span role="status">Thanks! Your payment is being confirmed. Credits usually appear here within a minute.</span>{" "}
        If they don&apos;t, check{" "}
        <Link href="/app/credits/billing" className="font-medium underline">payment history</Link>.
      </Alert>
    );
  }
  return null;
}

export default function CreditsPage() {
  const { data, isPending, error, refetch } = useCredits();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <PageHeader title="Credits" description="Credits pay for AI work. You're only charged for what's actually generated." />
      <CheckoutReturnNotice balance={data?.wallet.balance} refetch={() => void refetch()} />
      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Available</p>
              <p className="mt-1 text-4xl font-bold">{formatNumber(data.wallet.balance)}</p>
              {data.wallet.reserved > 0 && <p className="mt-1 text-sm text-muted-foreground">+ {data.wallet.reserved} reserved for running jobs</p>}
              <p className="mt-4 text-xs text-muted-foreground">
                <Link href="/app/credits/billing" className="text-primary-hover underline-offset-4 hover:underline">
                  Buy a plan
                </Link>{" "}
                to add credits and unlock paid capabilities.
              </p>
            </Card>
            <Card className="p-6">
              <p className="mb-3 text-sm font-semibold">What things cost</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex justify-between"><span>Book outline</span><span className="font-medium text-foreground">{CREDIT_COSTS.outline} credits</span></li>
                <li className="flex justify-between"><span>Chapter (per 1,000 words)</span><span className="font-medium text-foreground">{CREDIT_COSTS.chapterPer1000Words} credits</span></li>
                <li className="flex justify-between"><span>AI assistant edit</span><span className="font-medium text-foreground">{CREDIT_COSTS.assist} credit</span></li>
                <li className="flex justify-between"><span>Exports (PDF, EPUB, DOCX)</span><span className="font-medium text-foreground">Free</span></li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Cover and illustration images, AI quality reviews, marketing copy and store listings show their price before you start, and you&apos;re only charged when the result is saved.
              </p>
            </Card>
          </div>

          <Section title="History" description="Every credit movement on your account." className="mt-10">
            {data.transactions.length === 0 ? (
              <EmptyState icon={<Coins className="h-6 w-6" />} title="No activity yet" description="Credit usage will appear here." />
            ) : (
              <Card className="divide-y divide-border">
                {data.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.description ?? TYPE_LABEL[t.type]}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(t.createdAt)}</p>
                    </div>
                    <div className="text-end">
                      <Badge tone={t.amount > 0 ? "success" : t.amount < 0 ? "warning" : "neutral"}>
                        {t.amount > 0 ? "+" : ""}
                        {t.amount}
                      </Badge>
                      <p className="mt-0.5 text-xs text-muted-foreground">Balance {t.balanceAfter}</p>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}
