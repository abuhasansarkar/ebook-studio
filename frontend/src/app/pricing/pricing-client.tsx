"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, CreditCard } from "lucide-react";
import { FREE_TIER_ENTITLEMENTS } from "@ebook/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  credits: number;
  entitlements: Record<string, string | number | boolean>;
  recurring: boolean;
  interval?: "month" | "year";
}

const ENTITLEMENT_ROWS: { key: string; label: string; freeLabel: string }[] = [
  { key: "maxBooks", label: "Books at once", freeLabel: "1" },
  { key: "maxChaptersPerBook", label: "Chapters per book", freeLabel: "10" },
  { key: "priorityJobs", label: "Priority AI jobs", freeLabel: "—" },
  { key: "exports", label: "PDF, EPUB and DOCX export", freeLabel: "Included" },
  { key: "sourceImports", label: "Private source import", freeLabel: "Included" },
];

const ENTITLEMENT_LABEL: Record<string, string> = {
  maxBooks: "Books",
  maxChaptersPerBook: "Chapters per book",
  priorityJobs: "Priority jobs",
  exports: "PDF export",
  sourceImports: "Source imports",
};

/** Formats a minor-unit amount as money. */
function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/** Renders an entitlement value. */
function renderValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "Included" : "—";
  return String(value);
}

export function PricingClient({
  plans,
  providerLive,
}: {
  plans: PlanRow[];
  providerLive: boolean;
}) {
  const [annual, setAnnual] = useState(false);

  const displayedPlans = plans.filter((p) => {
    const isYearly = p.interval === "year" || p.id.endsWith("-yearly");
    return annual ? isYearly : !isYearly;
  });

  const highlightedId = displayedPlans.reduce<string | null>((best, plan) => {
    const value = Number(plan.entitlements.maxBooks ?? 0);
    if (best === null) return plan.id;
    const bestValue = Number(displayedPlans.find((p) => p.id === best)?.entitlements.maxBooks ?? 0);
    return value > bestValue ? plan.id : best;
  }, null);

  return (
    <>
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center pb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={cn(
              "rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer",
              !annual
                ? "bg-foreground text-background shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Monthly billing
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer",
              annual
                ? "bg-[#e8603c] text-white shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Annual billing</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider",
                annual ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              )}
            >
              Save ~20%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-label="Plans">
        {!providerLive && plans.length > 0 && (
          <div
            className="mx-auto mb-10 max-w-2xl rounded-2xl border border-warning/30 bg-warning-soft/50 px-6 py-4 text-center text-sm text-muted-foreground"
            data-testid="pricing-provider-notice"
          >
            <strong className="font-semibold text-foreground">Payments are not switched on in this build.</strong>{" "}
            The prices below are the published plan catalog, but no plan can be bought yet. You can still start free
            with 100 credits.
          </div>
        )}

        {displayedPlans.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {/* The free tier is shown as its own card because it is not bought. */}
            <div className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card" data-testid="pricing-card-free">
              <h2 className="text-base font-semibold">Free</h2>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">Enough to plan, write and export your first book.</p>
              <div className="mt-4">
                <p className="text-3xl font-bold">$0</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Always free</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">100 credits</p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span><span className="font-medium text-foreground">1</span> <span className="text-muted-foreground">Book</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span><span className="font-medium text-foreground">10</span> <span className="text-muted-foreground">Chapters per book</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-muted-foreground">PDF, EPUB and DOCX export</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-muted-foreground">Private source import</span>
                </li>
              </ul>
              <div className="mt-auto pt-6">
                <Link href="/signup" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>Start free</Link>
              </div>
            </div>

            {displayedPlans.map((plan) => {
              const highlighted = plan.id === highlightedId;
              const isYearly = plan.interval === "year" || plan.id.endsWith("-yearly");
              const monthlyEquivalent = isYearly ? Math.round(plan.priceMinor / 12) : plan.priceMinor;
              const discountBadge = plan.id === "studio-yearly" ? "Save 20%" : isYearly ? "2 months free" : null;
              const entitlements = Object.entries(plan.entitlements ?? {});

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-surface p-6 shadow-card transition-all duration-200",
                    highlighted ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                  data-testid={`pricing-card-${plan.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold">{plan.name}</h2>
                      {discountBadge && (
                        <span className="mt-1 inline-block rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">
                          {discountBadge}
                        </span>
                      )}
                    </div>
                    {highlighted && (
                      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-hover">Most capable</span>
                    )}
                  </div>
                  <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4">
                    <p className="text-3xl font-bold">
                      {formatPrice(monthlyEquivalent, plan.currency)}
                      {plan.recurring && <span className="text-sm font-normal text-muted-foreground"> /month</span>}
                    </p>
                    {isYearly ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Billed annually ({formatPrice(plan.priceMinor, plan.currency)}/yr)
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">Billed monthly</p>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground font-medium">
                    {new Intl.NumberFormat("en").format(plan.credits)} credits {isYearly ? "/yr" : "/mo"}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {entitlements.map(([key, value]) => (
                      <li key={key} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>
                          <span className="font-medium text-foreground">{renderValue(value)}</span>{" "}
                          <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key] ?? key}</span>
                        </span>
                      </li>
                    ))}
                    {Object.keys(FREE_TIER_ENTITLEMENTS)
                      .filter((key) => !(key in (plan.entitlements ?? {})))
                      .map((key) => (
                        <li key={key} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key] ?? key}</span>
                        </li>
                      ))}
                  </ul>
                  <div className="mt-auto pt-6">
                    {providerLive ? (
                      <Link href="/signup" className={cn(buttonVariants({ variant: highlighted ? "primary" : "secondary" }), "w-full")}>
                        Choose {plan.name}
                      </Link>
                    ) : (
                      <Link href="/signup" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
                        Start free
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Plans are not on offer right now</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The plan catalog could not be read. You can still start free and add a plan later.
            </p>
            <Link href="/signup" className={cn(buttonVariants(), "mt-6")}>Start free</Link>
          </div>
        )}
      </section>

      {/* Comparison grid */}
      {displayedPlans.length > 0 && (
        <section className="border-t border-border bg-surface py-16" aria-label="Compare plans">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Compare every capability</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              What each plan actually unlocks, next to what every author gets for free.
            </p>
            <div className="mt-12 overflow-x-auto rounded-2xl border border-border bg-background shadow-card">
              <table className="w-full min-w-[40rem] border-collapse text-sm" data-testid="pricing-comparison">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-4 text-start font-semibold">Capability</th>
                    <th scope="col" className="px-5 py-4 text-start font-semibold">Free</th>
                    {displayedPlans.map((plan) => (
                      <th key={plan.id} scope="col" className="px-5 py-4 text-start font-semibold">{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTITLEMENT_ROWS.map((row) => (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3.5 text-start font-medium">{row.label}</th>
                      <td className="px-5 py-3.5 text-muted-foreground">{row.freeLabel}</td>
                      {displayedPlans.map((plan) => {
                        const free = row.key in FREE_TIER_ENTITLEMENTS;
                        const value = plan.entitlements?.[row.key];
                        const included = free || (value !== undefined && value !== false);
                        return (
                          <td key={plan.id} className={cn("px-5 py-3.5", included ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {included ? (free ? "Included" : renderValue(value)) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40">
                    <th scope="row" className="px-5 py-3.5 text-start font-medium">Credits</th>
                    <td className="px-5 py-3.5 text-muted-foreground">100</td>
                    {displayedPlans.map((plan) => (
                      <td key={plan.id} className="px-5 py-3.5 font-medium text-foreground">
                        {new Intl.NumberFormat("en").format(plan.credits)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="px-5 py-3.5 text-start font-medium">Price</th>
                    <td className="px-5 py-3.5 font-medium text-foreground">Free</td>
                    {displayedPlans.map((plan) => {
                      const isYearly = plan.interval === "year" || plan.id.endsWith("-yearly");
                      return (
                        <td key={plan.id} className="px-5 py-3.5 font-medium text-foreground">
                          {formatPrice(plan.priceMinor, plan.currency)}
                          {plan.recurring && (
                            <span className="font-normal text-muted-foreground">
                              {isYearly ? " /yr" : " /mo"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
