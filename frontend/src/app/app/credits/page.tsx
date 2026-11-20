"use client";

import { Coins } from "lucide-react";
import { CREDIT_COSTS } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useCredits } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";

const TYPE_LABEL = { grant: "Added", reserve: "Reserved", charge: "Used", release: "Returned", refund: "Refunded" } as const;

export default function CreditsPage() {
  const { data, isLoading, error, refetch } = useCredits();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <PageHeader title="Credits" description="Credits pay for AI work. You're only charged for what's actually generated." />
      {isLoading ? (
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
              <p className="mt-4 text-xs text-muted-foreground">Paid plans and top-ups are coming soon.</p>
            </Card>
            <Card className="p-6">
              <p className="mb-3 text-sm font-semibold">What things cost</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex justify-between"><span>Book outline</span><span className="font-medium text-foreground">{CREDIT_COSTS.outline} credits</span></li>
                <li className="flex justify-between"><span>Chapter (per 1,000 words)</span><span className="font-medium text-foreground">{CREDIT_COSTS.chapterPer1000Words} credits</span></li>
                <li className="flex justify-between"><span>AI assistant edit</span><span className="font-medium text-foreground">{CREDIT_COSTS.assist} credit</span></li>
                <li className="flex justify-between"><span>PDF export</span><span className="font-medium text-foreground">Free</span></li>
              </ul>
            </Card>
          </div>

          <h2 className="mb-3 mt-10 text-lg font-semibold">History</h2>
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
        </>
      ) : null}
    </div>
  );
}
