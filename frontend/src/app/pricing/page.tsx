import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { FREE_TIER_ENTITLEMENTS } from "@ebook/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple plans for AI eBook writing. Compare books, chapters per book, credits, priority AI jobs and exports across every plan.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing · eBookStudio",
    description: "Simple plans for AI eBook writing. Compare every capability across the free tier and every paid plan.",
    url: "/pricing",
  },
};

/**
 * The pricing page.
 *
 * The plan cards are rendered on the server from the catalog the API
 * publishes, so the prices on this page are the prices that are charged. The
 * page never decides what a plan costs, and it never grants anything: buying a
 * plan happens on the billing screen, where the checkout is started.
 *
 * The catalog is read from the server during the request, so a plan that is
 * deactivated or repriced stops being offered without a frontend change.
 */

interface PlanRow {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  credits: number;
  entitlements: Record<string, string | number | boolean>;
  recurring: boolean;
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
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amountMinor / 100);
}

/** Renders an entitlement value. */
function renderValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "Included" : "—";
  return String(value);
}

/**
 * Reads the published plan catalog.
 *
 * The catalog is public, so this is a plain read with no session. A catalog
 * that cannot be read leaves the page without plans rather than showing a
 * price that was invented here.
 */
async function readCatalog(): Promise<{ plans: PlanRow[]; providerLive: boolean }> {
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${base}/api/v1/billing/plans`, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return { plans: [], providerLive: false };
    const data = (await response.json()) as { plans?: PlanRow[]; providerLive?: boolean };
    return { plans: data.plans ?? [], providerLive: data.providerLive ?? false };
  } catch {
    return { plans: [], providerLive: false };
  }
}

export default async function PricingPage() {
  const { plans, providerLive } = await readCatalog();
  const highlightedId = plans.reduce<string | null>((best, plan) => {
    const value = Number(plan.entitlements.maxBooks ?? 0);
    if (best === null) return plan.id;
    const bestValue = Number(plans.find((p) => p.id === best)?.entitlements.maxBooks ?? 0);
    return value > bestValue ? plan.id : best;
  }, null);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-semibold">eBookStudio</span>
          <nav className="flex items-center gap-4 text-sm" aria-label="Main">
            <Link href="/#features" className="hidden text-muted-foreground hover:text-foreground sm:inline">Features</Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">Log in</Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>Start free</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-hover">
            <Sparkles className="h-3.5 w-3.5" /> 100 free credits when you sign up
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Simple pricing</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Every plan includes PDF, EPUB and DOCX export and private source import. A plan adds credits and
            lifts the limits on how much you can publish at once.
          </p>
        </section>

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
          {plans.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {/* The free tier is shown as its own card because it is not bought. */}
              <div className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card" data-testid="pricing-card-free">
                <h2 className="text-base font-semibold">Free</h2>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">Enough to plan, write and export your first book.</p>
                <p className="mt-4 text-3xl font-bold">$0</p>
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
                <div className="mt-6">
                  <Link href="/signup" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>Start free</Link>
                </div>
              </div>

              {plans.map((plan) => {
                const highlighted = plan.id === highlightedId;
                const entitlements = Object.entries(plan.entitlements ?? {});
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex flex-col rounded-2xl border bg-surface p-6 shadow-card",
                      highlighted ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                    data-testid={`pricing-card-${plan.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold">{plan.name}</h2>
                      {highlighted && (
                        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-hover">Most capable</span>
                      )}
                    </div>
                    <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                    <p className="mt-4 text-3xl font-bold">
                      {formatPrice(plan.priceMinor, plan.currency)}
                      {plan.recurring && <span className="text-sm font-normal text-muted-foreground"> /month</span>}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Intl.NumberFormat("en").format(plan.credits)} credits
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
                      {/* The capabilities that are free for everyone are held by
                          this plan too, so the card does not hide them. */}
                      {Object.keys(FREE_TIER_ENTITLEMENTS)
                        .filter((key) => !(key in (plan.entitlements ?? {})))
                        .map((key) => (
                          <li key={key} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="text-muted-foreground">{ENTITLEMENT_LABEL[key] ?? key}</span>
                          </li>
                        ))}
                    </ul>
                    <div className="mt-6">
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
        {plans.length > 0 && (
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
                      {plans.map((plan) => (
                        <th key={plan.id} scope="col" className="px-5 py-4 text-start font-semibold">{plan.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ENTITLEMENT_ROWS.map((row) => (
                      <tr key={row.key} className="border-b border-border last:border-0">
                        <th scope="row" className="px-5 py-3.5 text-start font-medium">{row.label}</th>
                        <td className="px-5 py-3.5 text-muted-foreground">{row.freeLabel}</td>
                        {plans.map((plan) => {
                          // A capability that is free for everyone is held by
                          // every plan, so it must not read as missing here.
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
                          {plan.recurring && <span className="font-normal text-muted-foreground"> /mo</span>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Reassurance */}
        <section className="border-t border-border py-16">
          <div className="mx-auto grid max-w-4xl gap-6 px-4 sm:px-6 md:grid-cols-3">
            <div>
              <ShieldCheck className="h-7 w-7 text-primary" />
              <h3 className="mt-3 font-semibold">Credits are only charged for work done</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                You are charged for chapters actually written, and for nothing you did not start.
              </p>
            </div>
            <div>
              <CreditCard className="h-7 w-7 text-primary" />
              <h3 className="mt-3 font-semibold">Cancel any time</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Cancelling stops the renewal. Your plan and its benefits stay active until the period ends, and your
                credits are not affected.
              </p>
            </div>
            <div>
              <CheckCircle2 className="h-7 w-7 text-primary" />
              <h3 className="mt-3 font-semibold">Exports are never paywalled</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                PDF, EPUB and DOCX export and private source import are included on the free tier and on every plan.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span className="font-semibold">eBookStudio</span>
          <p>All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
