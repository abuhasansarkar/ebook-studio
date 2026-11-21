"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Coins, CreditCard, Sparkles } from "lucide-react";
import { FREE_TIER_ENTITLEMENTS, type EntitlementKey, type Plan, type SubscriptionStatus } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Section } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useBilling, useCancelSubscription, usePayments, usePlans, useStartCheckout } from "@/lib/queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/**
 * The billing page (S12).
 *
 * The page starts a checkout and shows the resulting state. It never grants
 * anything itself: the credits and the entitlements come from the server,
 * which only writes them when it has seen a verified payment event.
 */

const PAYMENT_TONE = {
  pending: "warning",
  succeeded: "success",
  failed: "danger",
  refunded: "neutral",
  partially_refunded: "warning",
} as const;

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  canceled: "neutral",
  incomplete: "warning",
  incomplete_expired: "danger",
};

const ENTITLEMENT_LABEL: Record<EntitlementKey, string> = {
  maxBooks: "Books",
  maxChaptersPerBook: "Chapters per book",
  priorityJobs: "Priority jobs",
  exports: "PDF export",
  sourceImports: "Source imports",
};

/**
 * The capabilities the product publishes as free.
 *
 * They are in every author's billing state because every author has them, so
 * the page separates them from what a plan actually added. Listing a free
 * capability as something a plan unlocks would be a false claim.
 */
const FREE_LABEL: Record<EntitlementKey, string> = {
  maxBooks: "Books",
  maxChaptersPerBook: "Chapters per book",
  priorityJobs: "Priority jobs",
  exports: "PDF, EPUB and DOCX export",
  sourceImports: "Private source import",
};

/** Formats a minor-unit amount as money. */
function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}

/** One plan in the catalog. */
function PlanCard({ plan, busy, onBuy }: { plan: Plan; busy: boolean; onBuy: () => void }) {
  const entitlements = Object.entries(plan.entitlements) as [EntitlementKey, string | number | boolean][];
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        {plan.recurring && <Badge tone="primary">Recurring</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      <p className="mt-4 text-3xl font-bold">
        {formatPrice(plan.priceMinor, plan.currency)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{formatNumber(plan.credits)} credits</p>
      {entitlements.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {entitlements.map(([key, value]) => (
            <li key={key} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key] ?? key}</span>
              <span className="font-medium text-foreground">{typeof value === "boolean" ? (value ? "Included" : "—") : String(value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Export and private source import are included on every plan, free.
      </p>
      <Button className="mt-6 w-full" loading={busy} onClick={onBuy} data-testid={`buy-plan-${plan.id}`}>
        Buy plan
      </Button>
    </Card>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const plansQuery = usePlans();
  const billingQuery = useBilling();
  const checkout = useStartCheckout();
  const cancel = useCancelSubscription();

  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const state = billingQuery.data;
  const catalog = plansQuery.data;
  const entitlements = Object.entries(state?.entitlements ?? {}) as [EntitlementKey, string | number | boolean][];
  // The free-tier capabilities are in every author's state, so only the ones a
  // plan actually added belong under "What your plan unlocks".
  const paidEntitlements = entitlements.filter(([key]) => !(key in FREE_TIER_ENTITLEMENTS));
  const subscription = state?.subscription ?? null;

  const busyPlanId = checkout.isPending ? (checkout.variables ?? null) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Plans and billing"
        description="Plans add credits and unlock capabilities. Credits are only added after a payment is confirmed by the provider."
      />

      {catalog && !catalog.providerLive && (
        <Alert tone="info" className="mb-6">
          This build talks to the local payment provider. It cannot take money, and no real payment is processed.
        </Alert>
      )}

      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}
      {problem && <Alert tone="danger" className="mb-6">{problem}</Alert>}

      {plansQuery.isLoading || billingQuery.isLoading ? (
        <PageLoader />
      ) : plansQuery.error ? (
        <ErrorState message={errorMessage(plansQuery.error)} onRetry={() => void plansQuery.refetch()} />
      ) : billingQuery.error ? (
        <ErrorState message={errorMessage(billingQuery.error)} onRetry={() => void billingQuery.refetch()} />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">Plans</h2>
          {catalog && catalog.plans.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {catalog.plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  busy={busyPlanId === plan.id}
                  onBuy={() => {
                    setProblem(null);
                    setNotice(null);
                    checkout.mutate(plan.id, {
                      onSuccess: (result) => {
                        // The customer completes the payment on the provider's
                        // own page. Nothing is granted here.
                        const url = result.checkout.url;
                        if (url) {
                          router.push(url);
                          return;
                        }
                        setNotice("Checkout started. Credits are added once the payment is confirmed.");
                        void billingQuery.refetch();
                      },
                      onError: (err) => setProblem(errorMessage(err)),
                    });
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title="No plans on offer" description="Plans will appear here when they are published." />
          )}

          <Section title="Your subscription" className="mt-10">
            {subscription ? (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{subscription.planName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Started {timeAgo(subscription.createdAt)}
                    {subscription.currentPeriodEnd ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Badge tone={SUBSCRIPTION_TONE[subscription.status]}>{subscription.status.replace(/_/g, " ")}</Badge>
              </div>
              {subscription.canceledAt && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Cancelled {timeAgo(subscription.canceledAt)}. It stays active until the period ends.
                </p>
              )}
              <Button
                variant="secondary"
                className="mt-5"
                loading={cancel.isPending}
                disabled={subscription.canceledAt !== null}
                onClick={() => {
                  setProblem(null);
                  setNotice(null);
                  cancel.mutate(undefined, {
                    onSuccess: () => setNotice("Subscription cancelled. It stays active until the period ends."),
                    onError: (err) => setProblem(errorMessage(err)),
                  });
                }}
                data-testid="cancel-subscription"
              >
                {subscription.canceledAt ? "Cancelled" : "Cancel subscription"}
              </Button>
            </Card>
            ) : (
              <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No subscription" description="Buying a plan starts a subscription." />
            )}
          </Section>

          <Section
            title="What your plan unlocks"
            description="The capabilities a paid plan adds on top of the free tier."
            className="mt-10"
          >
            {paidEntitlements.length > 0 ? (
              <Card className="divide-y divide-border" data-testid="paid-entitlements">
                {paidEntitlements.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <p className="text-sm font-medium">{ENTITLEMENT_LABEL[key] ?? key}</p>
                    <Badge tone="success">{typeof value === "boolean" ? (value ? "Included" : "—") : String(value)}</Badge>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="p-6 text-sm text-muted-foreground" data-testid="paid-entitlements">
                No paid capabilities are unlocked yet. Entitlements are added only when a payment is confirmed.
              </Card>
            )}
          </Section>

          <Section title="Included on every plan" className="mt-10">
            <Card className="divide-y divide-border" data-testid="free-entitlements">
              {(Object.keys(FREE_TIER_ENTITLEMENTS) as EntitlementKey[]).map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <p className="text-sm font-medium">{FREE_LABEL[key] ?? key}</p>
                  <Badge tone="neutral">Free</Badge>
                </div>
              ))}
            </Card>
          </Section>

          <PaymentHistory />
        </>
      )}
    </div>
  );
}

/**
 * The author's payments, read on their own.
 *
 * This is the scoped payment list rather than the copy nested inside the
 * billing state, so it is refreshed on its own after a checkout settles and
 * it keeps working when the rest of the billing state is still loading.
 */
function PaymentHistory() {
  const payments = usePayments();

  return (
    <Section title="Payment history" description="Every payment on your account, newest first.">
      {payments.isPending ? (
        <PageLoader label="Loading your payments…" />
      ) : payments.error ? (
        <ErrorState message={errorMessage(payments.error)} onRetry={() => void payments.refetch()} />
      ) : (payments.data ?? []).length > 0 ? (
        <Card className="divide-y divide-border" data-testid="payment-history">
          {payments.data!.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{payment.planName ?? "Payment"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPrice(payment.amountMinor, payment.currency)} · {timeAgo(payment.createdAt)}
                  {payment.description && payment.description !== payment.planName ? ` · ${payment.description}` : ""}
                </p>
              </div>
              <div className="text-end">
                <Badge tone={PAYMENT_TONE[payment.status] ?? "neutral"}>{payment.status.replace(/_/g, " ")}</Badge>
                {payment.credits > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">+{formatNumber(payment.credits)} credits</p>
                )}
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<Coins className="h-6 w-6" />}
          title="No payments yet"
          description="Your payments will appear here once they are confirmed."
        />
      )}
    </Section>
  );
}
