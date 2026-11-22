"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Coins, CreditCard, RefreshCw, Sparkles } from "lucide-react";
import { FREE_TIER_ENTITLEMENTS, type EntitlementKey, type Plan, type SubscriptionStatus } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { PricingComparison } from "@/components/billing/pricing-table";
import { OneTimeCreditPacks } from "@/components/billing/one-time-credit-packs";
import { useCheckoutRedirect } from "@/components/billing/use-checkout-redirect";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Section } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorMessage } from "@/lib/api";
import { useBilling, useCancelSubscription, useCredits, usePayments, usePlans, useSyncBilling } from "@/lib/queries";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

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

/** Formats a minor-unit amount as money. */
function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}

/** Free Tier / Trial dedicated card */
function FreeTrialCard({ isCurrentPlan }: { isCurrentPlan: boolean }) {
  return (
    <Card className={cn("p-6 border-dashed border-border bg-surface/70 transition-all duration-200", isCurrentPlan && "border-primary/50 ring-2 ring-primary/20 bg-primary-soft/10")}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary-soft p-2.5 text-primary shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Free Tier & Trial</h3>
                {isCurrentPlan ? (
                  <Badge tone="success">Current Plan</Badge>
                ) : (
                  <Badge tone="neutral">Base Account Tier</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Standard author capabilities to plan, outline, and draft eBooks. Every account includes 99 free welcome credits with no credit card required. Upgrade to Pro to export print and digital files.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-border">
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-center min-w-[5.5rem]">
            <span className="text-[11px] text-muted-foreground block">Cost</span>
            <span className="text-base font-bold text-foreground">$0.00</span>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-center min-w-[5.5rem]">
            <span className="text-[11px] text-muted-foreground block">Welcome Credits</span>
            <span className="text-base font-bold text-foreground">99</span>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-center min-w-[5.5rem]">
            <span className="text-[11px] text-muted-foreground block">Active Books</span>
            <span className="text-base font-bold text-foreground">1 book</span>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-center min-w-[5.5rem]">
            <span className="text-[11px] text-muted-foreground block">Exports</span>
            <span className="text-base font-bold text-warning">Pro Only</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** One plan in the catalog. */
function PlanCard({
  plan,
  isCurrentPlan,
  busy,
  disabled,
  onBuy,
}: {
  plan: Plan;
  isCurrentPlan?: boolean;
  busy: boolean;
  /** Another checkout is starting or redirecting. */
  disabled?: boolean;
  onBuy: () => void;
}) {
  const entitlements = Object.entries(plan.entitlements) as [EntitlementKey, string | number | boolean][];
  const isYearly = plan.interval === "year" || plan.id.endsWith("-yearly");
  const monthlyEquivalent = isYearly ? Math.round(plan.priceMinor / 12) : plan.priceMinor;
  const discountLabel = plan.id === "studio-yearly" ? "Save 20%" : isYearly ? "2 months free" : null;

  return (
    <Card className={cn("flex flex-col p-6 transition-all duration-200", isCurrentPlan && "border-primary/50 ring-2 ring-primary/20 bg-primary-soft/10")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{plan.name}</h3>
          {discountLabel && (
            <span className="mt-1 inline-block rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">
              {discountLabel}
            </span>
          )}
        </div>
        {isCurrentPlan ? (
          <Badge tone="success">Current Plan</Badge>
        ) : plan.recurring ? (
          <Badge tone={isYearly ? "success" : "primary"}>{isYearly ? "Annual" : "Recurring"}</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      <div className="mt-4">
        <p className="text-3xl font-bold">
          {formatPrice(monthlyEquivalent, plan.currency)}
          <span className="text-sm font-normal text-muted-foreground"> /month</span>
        </p>
        {isYearly ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Billed annually ({formatPrice(plan.priceMinor, plan.currency)}/yr)
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Billed monthly</p>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{formatNumber(plan.credits)} credits {isYearly ? "/yr" : "/mo"}</p>
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
        PDF, EPUB and DOCX export are included with every Pro plan. Private source import is free on every account.
      </p>
      {isCurrentPlan ? (
        <Button variant="secondary" disabled className="mt-6 w-full">
          Current plan ✓
        </Button>
      ) : (
        <Button className="mt-6 w-full" loading={busy} disabled={disabled} onClick={onBuy} data-testid={`buy-plan-${plan.id}`}>
          Buy plan
        </Button>
      )}
    </Card>
  );
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plansQuery = usePlans();
  const billingQuery = useBilling();
  const creditsQuery = useCredits();
  const checkout = useCheckoutRedirect();
  const cancel = useCancelSubscription();
  const sync = useSyncBilling();

  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"month" | "year" | null>(null);

  useEffect(() => {
    const status = searchParams.get("checkout");
    if (!status) return;

    router.replace("/app/credits/billing", { scroll: false });
    const timer = setTimeout(() => {
      if (status === "success") {
        setNotice("Payment received! Synchronizing your plan and credits with Stripe…");
        sync.mutate(undefined, {
          onSuccess: () => {
            setNotice("Plan and credits are updated successfully!");
          },
        });
      } else if (status === "cancelled") {
        setProblem("Checkout was cancelled. No charges were made.");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [searchParams, sync, router]);

  const state = billingQuery.data;
  const catalog = plansQuery.data;
  const currentPlan = state?.currentPlan;
  const subscription = state?.subscription ?? null;
  const subscriptions = state?.subscriptions ?? (subscription ? [subscription] : []);
  const payments = state?.payments ?? [];
  const pendingPayment = payments.find((p) => p.status === "pending");

  const isYearly = currentPlan?.interval === "year" || currentPlan?.id.endsWith("-yearly");
  const billingCycle = selectedBillingCycle ?? (isYearly ? "year" : "month");
  const setBillingCycle = (cycle: "month" | "year") => setSelectedBillingCycle(cycle);

  const entitlements = Object.entries(state?.entitlements ?? {}) as [EntitlementKey, string | number | boolean][];
  const paidEntitlements = entitlements.filter(([key, value]) => {
    if (key === "sourceImports") return false;
    const freeVal = FREE_TIER_ENTITLEMENTS[key];
    if (typeof value === "number" && typeof freeVal === "number") {
      return value > freeVal;
    }
    return value !== freeVal;
  });

  const busyPlanId = checkout.pendingPlanId;
  const buy = (planId: string) => {
    setProblem(null);
    setNotice(null);
    checkout.start(planId, {
      onNoRedirect: () => {
        setNotice("Checkout started. Credits are added once payment is confirmed.");
        void billingQuery.refetch();
      },
      onError: (err) => setProblem(errorMessage(err)),
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Plans and billing"
        description="Plans add credits and unlock capabilities. Credits are only added after a payment is confirmed by the provider."
      />

      {catalog && !catalog.providerLive && (
        <Alert tone="info" className="mb-6">
          {catalog.provider === "stripe" ? (
            <div>
              <span className="font-semibold">Stripe Test Mode: </span>
              This environment is connected to Stripe with Test Keys. You can complete payments using standard Stripe test card numbers.
            </div>
          ) : (
            "This build talks to the local payment provider. It cannot take money, and no real payment is processed."
          )}
        </Alert>
      )}

      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}
      {problem && <Alert tone="danger" className="mb-6">{problem}</Alert>}

      {pendingPayment && (
        <Alert tone="warning" className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-semibold">Pending Checkout: </span>
            You have a pending {pendingPayment.planName ?? "plan"} checkout ({formatPrice(pendingPayment.amountMinor, pendingPayment.currency)}). If you already finished payment on Stripe, sync to activate it immediately.
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={sync.isPending}
            onClick={() => {
              setProblem(null);
              sync.mutate(undefined, {
                onSuccess: () => setNotice("Payment confirmed and account upgraded!"),
                onError: (err) => setProblem(errorMessage(err)),
              });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh payment status
          </Button>
        </Alert>
      )}

      {plansQuery.isLoading || billingQuery.isLoading ? (
        <PageLoader />
      ) : plansQuery.error ? (
        <ErrorState message={errorMessage(plansQuery.error)} onRetry={() => void plansQuery.refetch()} />
      ) : billingQuery.error ? (
        <ErrorState message={errorMessage(billingQuery.error)} onRetry={() => void billingQuery.refetch()} />
      ) : (
        <>
          {/* Current Plan Overview Card */}
          <Section title="Current plan & subscription" className="mb-8">
            <Card className="p-6 border-primary/20 bg-gradient-to-br from-surface to-primary-soft/10">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {currentPlan?.name ?? (subscription ? subscription.planName : "Free Plan")}
                    </h2>
                    <Badge tone={currentPlan?.status ? SUBSCRIPTION_TONE[currentPlan.status] : "success"}>
                      {(currentPlan?.status ?? "active").toUpperCase()}
                    </Badge>
                    {currentPlan?.recurring && <Badge tone="primary">RECURRING</Badge>}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {currentPlan?.description ?? (subscription ? "Active paid subscription." : "Standard author capabilities and welcome credits.")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">Plan Price: </span>
                      <span className="font-semibold text-foreground">
                        {currentPlan?.priceMinor && currentPlan.priceMinor > 0 ? (
                          <>
                            {formatPrice(currentPlan.priceMinor, currentPlan.currency)}
                            {currentPlan?.recurring ? (currentPlan.interval === "year" || currentPlan.id.endsWith("-yearly") ? " / year" : " / month") : ""}
                          </>
                        ) : "Free"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Available Credits: </span>
                      <span className="font-bold text-foreground font-mono">
                        {formatNumber(creditsQuery.data?.wallet?.balance ?? currentPlan?.credits ?? 0)} credits
                      </span>
                    </div>
                    {subscription?.currentPeriodEnd && (
                      <div>
                        <span className="text-muted-foreground">{subscription.canceledAt ? "Ends on: " : "Renews on: "}</span>
                        <span className="font-semibold text-foreground">
                          {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:self-start">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={sync.isPending}
                    onClick={() => {
                      setProblem(null);
                      setNotice(null);
                      sync.mutate(undefined, {
                        onSuccess: () => setNotice("Plan and subscription status refreshed."),
                        onError: (err) => setProblem(errorMessage(err)),
                      });
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh payment status
                  </Button>
                  {subscription && !subscription.canceledAt && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-danger hover:text-danger hover:bg-danger-soft"
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel subscription
                    </Button>
                  )}
                </div>
              </div>

              {subscription?.canceledAt && (
                <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
                  Subscription cancelled {timeAgo(subscription.canceledAt)}. Your plan and its benefits remain active until {new Date(subscription.currentPeriodEnd!).toLocaleDateString()}.
                </p>
              )}

              <ConfirmDialog
                open={confirmCancel}
                onClose={() => setConfirmCancel(false)}
                title="Cancel your subscription?"
                description={subscription?.currentPeriodEnd ? `It won't renew. You keep the plan and its benefits until ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.` : "It ends now."}
                confirmLabel="Cancel subscription"
                cancelLabel="Keep subscription"
                busy={cancel.isPending}
                onConfirm={() => {
                  setProblem(null);
                  setNotice(null);
                  cancel.mutate(undefined, {
                    onSuccess: () => { setConfirmCancel(false); setNotice("Subscription cancelled. It will not renew."); },
                    onError: (err) => { setConfirmCancel(false); setProblem(errorMessage(err)); },
                  });
                }}
              >
                Credits you already have are not affected.
              </ConfirmDialog>
            </Card>
          </Section>

          {/* Separate Free Tier & Trial Section */}
          <Section
            title="Free tier & trial"
            description="Base author capabilities and welcome credits included on every account without a paid subscription."
            className="mb-8"
          >
            <FreeTrialCard isCurrentPlan={!currentPlan || currentPlan.id === "free"} />
          </Section>

          {/* Paid Subscription Plans */}
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Subscription plans</h2>
              <p className="text-xs text-muted-foreground">
                Select your preferred billing frequency. Annual plans include up to 20% discount.
              </p>
            </div>
            {/* Monthly / Annual Toggle */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface p-1 shadow-xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setBillingCycle("month")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer",
                  billingCycle === "month"
                    ? "bg-foreground text-background shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Monthly billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("year")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer",
                  billingCycle === "year"
                    ? "bg-[#e8603c] text-white shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>Annual billing</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider",
                    billingCycle === "year"
                      ? "bg-white/20 text-white"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  Save ~20%
                </span>
              </button>
            </div>
          </div>

          {catalog && catalog.plans.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-3">
              {catalog.plans
                .filter((p) => {
                  if (!p.recurring) return false;
                  const isYearly = p.interval === "year" || p.id.endsWith("-yearly");
                  return billingCycle === "year" ? isYearly : !isYearly;
                })
                .map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isCurrentPlan={currentPlan?.id === plan.id}
                    busy={busyPlanId === plan.id}
                    disabled={checkout.busy}
                    onBuy={() => buy(plan.id)}
                  />
                ))}
            </div>
          ) : (
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title="No plans on offer" description="Plans will appear here when they are published." />
          )}

          {/* One-Time Extra Credit Top-Up Packs */}
          {catalog && catalog.plans.some((p) => !p.recurring) && (
            <Section
              title="Need extra credits?"
              description="Buy one-time generation credit packs on demand without a recurring monthly plan. Credits never expire."
              className="mt-10"
            >
              <OneTimeCreditPacks packs={catalog.plans.filter((p) => !p.recurring)} pendingPlanId={busyPlanId} onBuy={buy} />
            </Section>
          )}

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
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <p className="text-sm font-medium">Private source import</p>
                <Badge tone="success">Included free</Badge>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <p className="text-sm font-medium">Books limit (Free tier)</p>
                <span className="text-sm font-semibold text-foreground">1 active book</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <p className="text-sm font-medium">Chapters per book limit (Free tier)</p>
                <span className="text-sm font-semibold text-foreground">10 chapters</span>
              </div>
            </Card>
          </Section>

          {/* Subscription History Section */}
          <Section title="Subscription history" description="All past and current subscriptions on your account." className="mt-10">
            {subscriptions.length > 0 ? (
              <Card className="divide-y divide-border" data-testid="subscription-history">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{sub.planName}</p>
                      <p className="text-xs text-muted-foreground">
                        Started {timeAgo(sub.createdAt)}
                        {sub.currentPeriodEnd ? ` · ${sub.canceledAt ? "Ends" : "Renews"} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Badge tone={SUBSCRIPTION_TONE[sub.status]}>{sub.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">
                No subscription history yet.
              </Card>
            )}
          </Section>

          <Section title="Compare every plan" description="What each plan unlocks, next to what every author gets for free." className="mt-10">
            {catalog && catalog.plans.length > 0 ? (
              <PricingComparison
                plans={catalog.plans.filter((p) => {
                  if (!p.recurring) return false;
                  const isYearly = p.interval === "year" || p.id.endsWith("-yearly");
                  return billingCycle === "year" ? isYearly : !isYearly;
                })}
              />
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">
                The plan catalog is empty right now, so there is nothing to compare.
              </Card>
            )}
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

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BillingContent />
    </Suspense>
  );
}

