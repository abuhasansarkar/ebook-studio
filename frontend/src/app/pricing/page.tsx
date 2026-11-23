import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PricingClient, type PlanRow } from "./pricing-client";
import { Logo } from "@/components/app/logo";

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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <nav className="flex items-center gap-4 text-sm" aria-label="Main">
            <Link href="/#features" className="hidden text-muted-foreground hover:text-foreground sm:inline">Features</Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">Log in</Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>Start free</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 pb-6 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-hover">
            <Sparkles className="h-3.5 w-3.5" /> 100 free credits when you sign up
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Simple pricing</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Every plan includes PDF, EPUB and DOCX export and private source import. A plan adds credits and
            lifts the limits on how much you can publish at once.
          </p>
        </section>

        {/* Pricing Interactive Client (Toggle, Plan Cards, Comparison) */}
        <PricingClient plans={plans} providerLive={providerLive} />

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
