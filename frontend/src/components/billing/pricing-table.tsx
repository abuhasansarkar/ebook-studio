"use client";

import type { EntitlementKey, Plan } from "@ebook/shared";
import { FREE_TIER_ENTITLEMENTS } from "@ebook/shared";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pricing table (S12).
 *
 * The table is rendered from the plan catalog the server publishes, so the
 * prices shown here are the prices that are actually charged. Nothing here
 * decides what a plan costs.
 *
 * The comparison grid lists every entitlement key as a row. A row that every
 * plan includes would be noise, so the free tier is shown as its own column
 * rather than as a plan: the free capabilities are not bought, and listing
 * them as a plan would claim they can be purchased.
 */

/**
 * How each entitlement is described in the grid.
 *
 * `freeLabel` is what the free tier has. A capability that is free for
 * everyone is held by every plan as well, so it reads "Included" in every
 * paid column rather than looking like something a plan removes.
 */
const ENTITLEMENT_ROWS: { key: EntitlementKey; label: string; freeLabel: string }[] = [
  { key: "maxBooks", label: "Books at once", freeLabel: "1" },
  { key: "maxChaptersPerBook", label: "Chapters per book", freeLabel: "10" },
  { key: "priorityJobs", label: "Priority AI jobs", freeLabel: "—" },
  { key: "exports", label: "PDF, EPUB and DOCX export", freeLabel: "Included" },
  { key: "sourceImports", label: "Private source import", freeLabel: "Included" },
];

const ENTITLEMENT_LABEL: Record<EntitlementKey, string> = {
  maxBooks: "Books",
  maxChaptersPerBook: "Chapters per book",
  priorityJobs: "Priority jobs",
  exports: "PDF export",
  sourceImports: "Source imports",
};

/** Formats a minor-unit amount as money. */
export function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amountMinor / 100);
}

/** Renders an entitlement value as the grid shows it. */
function renderValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "Included" : "—";
  return String(value);
}

/**
 * What a plan actually holds for one entitlement.
 *
 * A capability that is free for everyone is held by every plan, whether or
 * not the plan lists it. A plan cannot take a free capability away, so the
 * grid must not show it as missing from the paid columns.
 */
function planHolds(plan: Plan, key: EntitlementKey): boolean {
  if (key in FREE_TIER_ENTITLEMENTS) return true;
  const value = plan.entitlements[key];
  return value !== undefined && value !== false;
}

/** What the grid shows for one plan and one entitlement. */
function planValue(plan: Plan, key: EntitlementKey): string {
  if (key in FREE_TIER_ENTITLEMENTS) return "Included";
  const value = plan.entitlements[key];
  if (value === undefined || value === false) return "—";
  return renderValue(value);
}

/**
 * One plan card.
 *
 * The highlighted card is the one the server marks as the most capable, so
 * the emphasis follows the catalog rather than a hard-coded position.
 */
export function PricingCard({
  plan,
  highlighted,
  cta,
}: {
  plan: Plan;
  highlighted?: boolean;
  cta?: React.ReactNode;
}) {
  const entitlements = Object.entries(plan.entitlements) as [EntitlementKey, string | number | boolean][];
  const isYearly = plan.interval === "year" || plan.id.endsWith("-yearly");
  const monthlyEquivalent = isYearly ? Math.round(plan.priceMinor / 12) : plan.priceMinor;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-surface p-6 shadow-card",
        highlighted ? "border-primary ring-1 ring-primary" : "border-border",
      )}
      data-testid={`pricing-card-${plan.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        <div className="flex flex-wrap justify-end gap-1.5">
          {highlighted && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-hover">Most capable</span>}
          {isYearly ? (
            <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-semibold">
              Save ~20%
            </span>
          ) : plan.recurring ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Monthly</span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
      <div className="mt-4">
        <p className="text-3xl font-bold">
          {formatPrice(monthlyEquivalent, plan.currency)}
          {plan.recurring && <span className="text-sm font-normal text-muted-foreground"> /month</span>}
        </p>
        {isYearly && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Billed annually ({formatPrice(plan.priceMinor, plan.currency)}/yr)
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {new Intl.NumberFormat("en").format(plan.credits)} credits {isYearly ? "/year" : ""}
      </p>
      {entitlements.length > 0 && (
        <ul className="mt-5 space-y-2 text-sm">
          {entitlements.map(([key, value]) => (
            <li key={key} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                <span className="font-medium text-foreground">{renderValue(value)}</span>{" "}
                <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key] ?? key}</span>
              </span>
            </li>
          ))}
          {/* The capabilities that are free for everyone are held by this plan
              too, so the card does not hide them. */}
          {Object.keys(FREE_TIER_ENTITLEMENTS)
            .filter((key) => !(key in plan.entitlements))
            .map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key as EntitlementKey] ?? key}</span>
              </li>
            ))}
        </ul>
      )}
      {cta && <div className="mt-6">{cta}</div>}
    </div>
  );
}

/**
 * The full comparison grid.
 *
 * Every entitlement key is a row, so two plans can be compared without reading
 * two separate cards side by side. The free tier is the first column.
 */
export function PricingComparison({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="pricing-comparison">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-4 text-start font-semibold">Capability</th>
            <th scope="col" className="px-5 py-4 text-start font-semibold">Free</th>
            {plans.map((plan) => (
              <th key={plan.id} scope="col" className="px-5 py-4 text-start font-semibold">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ENTITLEMENT_ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <th scope="row" className="px-5 py-3.5 text-start font-medium">
                {row.label}
              </th>
              <td className="px-5 py-3.5 text-muted-foreground">{row.freeLabel}</td>
              {plans.map((plan) => {
                const included = planHolds(plan, row.key);
                return (
                  <td key={plan.id} className={cn("px-5 py-3.5", included ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {included ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-success" />
                        {planValue(plan, row.key)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Minus className="h-4 w-4" />
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-border bg-muted/40">
            <th scope="row" className="px-5 py-3.5 text-start font-medium">Credits</th>
            <td className="px-5 py-3.5 text-muted-foreground">100</td>
            {plans.map((plan) => (
              <td key={plan.id} className="px-5 py-3.5 font-medium text-foreground">
                {new Intl.NumberFormat("en").format(plan.credits)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="px-5 py-3.5 text-start font-medium">Price</th>
            <td className="px-5 py-3.5 font-medium text-foreground">Free</td>
            {plans.map((plan) => (
              <td key={plan.id} className="px-5 py-3.5 font-medium text-foreground">
                {formatPrice(plan.priceMinor, plan.currency)}
                {plan.recurring && (
                  <span className="font-normal text-muted-foreground">
                    {plan.interval === "year" || plan.id.endsWith("-yearly") ? " /yr" : " /mo"}
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The capabilities every author holds, listed as a free row set. */
export function FreeTierList() {
  return (
    <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      {Object.keys(FREE_TIER_ENTITLEMENTS).map((key) => (
        <li key={key} className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-success" />
          {ENTITLEMENT_LABEL[key as EntitlementKey] ?? key}
        </li>
      ))}
    </ul>
  );
}
