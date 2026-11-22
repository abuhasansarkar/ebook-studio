"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Zap,
  RefreshCw,
  Lock,
  Coins,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProPlanData {
  id: string;
  name: string;
  badge?: string;
  popular?: boolean;
  tagline: string;
  monthlyPrice: number;
  annualMonthlyEquiv: number;
  annualTotal: number;
  monthlyCredits: number;
  annualCredits: number;
  features: string[];
}

const PRO_PLANS: ProPlanData[] = [
  {
    id: "creator",
    name: "Creator Pro",
    tagline: "Ideal for new authors & creators launching their first titles.",
    monthlyPrice: 29,
    annualMonthlyEquiv: 23,
    annualTotal: 278,
    monthlyCredits: 300,
    annualCredits: 3600,
    features: [
      "300 generation credits /mo (3,600 /yr)",
      "Up to 5 active books at once",
      "Up to 30 chapters per book",
      "Full PDF, EPUB 3 & DOCX exports",
      "300 DPI vector line-art print interiors",
      "Full-wrap Amazon KDP cover generator",
      "Standard AI generation queue",
      "100% Commercial rights & royalty ownership",
    ],
  },
  {
    id: "author",
    name: "Author Pro",
    popular: true,
    badge: "Most Popular",
    tagline: "Everything you need to write, illustrate, and publish at scale.",
    monthlyPrice: 49,
    annualMonthlyEquiv: 39,
    annualTotal: 470,
    monthlyCredits: 750,
    annualCredits: 9000,
    features: [
      "750 generation credits /mo (9,000 /yr)",
      "Priority AI queue (2x faster generation)",
      "Up to 25 active books at once",
      "Up to 60 chapters per book",
      "Full PDF, EPUB 3 & DOCX exports",
      "Automated Amazon KDP spine calculator",
      "300 DPI vector line-art print interiors",
      "100% Commercial rights & royalty ownership",
    ],
  },
  {
    id: "studio",
    name: "Studio Pro",
    badge: "Maximum Scale",
    tagline: "For prolific publishers, teams, and high-volume book shops.",
    monthlyPrice: 99,
    annualMonthlyEquiv: 79,
    annualTotal: 950,
    monthlyCredits: 2000,
    annualCredits: 24000,
    features: [
      "2,000 generation credits /mo (24,000 /yr)",
      "Priority AI queue with dedicated capacity",
      "Up to 100 active books at once",
      "Up to 120 chapters per book",
      "Full PDF, EPUB 3 & DOCX exports",
      "Amazon KDP, Etsy & Gumroad bundle exports",
      "Dedicated priority customer support",
      "100% Commercial rights & royalty ownership",
    ],
  },
];

const CREDIT_PACKS = [
  {
    id: "pack-mini",
    name: "Mini Pack",
    price: "$9",
    credits: "150",
    description: "Quick top-up for outlines, edits, or a few illustrations.",
  },
  {
    id: "pack-creator",
    name: "Creator Pack",
    price: "$25",
    credits: "500",
    popular: true,
    description: "Enough credits to write, illustrate, and package a full book.",
  },
  {
    id: "pack-power",
    name: "Power Pack",
    price: "$49",
    credits: "1,200",
    description: "Best volume value for multi-book series and coloring albums.",
  },
];

const GUARANTEES = [
  {
    icon: ShieldCheck,
    title: "14-Day Money-Back",
    desc: "Full refund if you are not delighted with your book files.",
  },
  {
    icon: Zap,
    title: "100% Commercial Rights",
    desc: "You own all text, covers, and illustrations royalty-free forever.",
  },
  {
    icon: RefreshCw,
    title: "Cancel Anytime",
    desc: "No long-term lock-in. Your files and balance stay in your account.",
  },
  {
    icon: Lock,
    title: "256-Bit SSL Checkout",
    desc: "Bank-grade encrypted card processing powered securely by Stripe.",
  },
];

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="py-24 bg-background relative overflow-hidden" aria-label="Pricing and Plans">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary transition-transform hover:scale-105">
            <Sparkles className="h-3 w-3" />
            TRANSPARENT PLANS
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Simple, transparent pricing for every creator.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
            Start completely free with 99 credits. Upgrade to a Pro plan to unlock high-resolution commercial exports and priority generation.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 shadow-sm">
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
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Dedicated Free Tier & Trial Banner */}
        <div className="mt-12 max-w-6xl mx-auto rounded-3xl border border-dashed border-border bg-surface/70 p-6 sm:p-8 shadow-card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                  Free Tier & Trial
                </span>
                <span className="text-xs text-muted-foreground">• No credit card needed</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-foreground">
                Start free with 99 credits, upgrade when you&apos;re ready to publish
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Test the full AI outline generator, rich-text editor, and coloring book studio. High-resolution PDF, EPUB, and DOCX exports are unlocked on Pro plans.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 border-t lg:border-t-0 pt-4 lg:pt-0 border-border">
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">Cost</span>
                <span className="text-xl font-black text-foreground">$0.00</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">Credits</span>
                <span className="text-xl font-black text-foreground">99</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">Limits</span>
                <span className="text-sm font-bold text-foreground block">1 Book · 10 Ch.</span>
              </div>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background hover:bg-surface px-5 py-3 text-xs sm:text-sm font-bold text-foreground shadow-xs transition-all hover:border-foreground/30 ml-auto"
              >
                <span>Start free trial</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* 3 Pro Plans Grid */}
        <div className="mt-10 grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto items-stretch">
          {PRO_PLANS.map((plan) => {
            const price = annual ? plan.annualMonthlyEquiv : plan.monthlyPrice;
            const credits = annual ? plan.annualCredits : plan.monthlyCredits;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-3xl bg-surface p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
                  plan.popular
                    ? "border-2 border-[#e8603c] ring-1 ring-[#e8603c]/20 shadow-[#e8603c]/10"
                    : "border border-border",
                )}
              >
                {/* Popular Pill */}
                {plan.badge && (
                  <div
                    className={cn(
                      "absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider shadow-sm",
                      plan.popular
                        ? "bg-gradient-to-r from-[#e8603c] to-[#ff7854] text-white shadow-md"
                        : "bg-surface border border-border text-foreground",
                    )}
                  >
                    {plan.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-black text-foreground">{plan.name}</h3>
                    {plan.popular && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#e8603c]">
                        <Star className="h-3.5 w-3.5 fill-[#e8603c]" />
                        Best Value
                      </span>
                    )}
                  </div>
                  <p className="mt-1 min-h-[2.5rem] text-xs text-muted-foreground leading-relaxed">
                    {plan.tagline}
                  </p>

                  {/* Price */}
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tight text-foreground">
                      ${price}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">/ month</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {annual ? (
                      <>
                        Billed annually (<strong>${plan.annualTotal}/yr</strong>) • Save 20%
                      </>
                    ) : (
                      "Billed monthly, cancel anytime"
                    )}
                  </p>

                  {/* Credits Pill */}
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-soft/80 px-3 py-1.5 text-xs font-bold text-primary">
                    <Coins className="h-3.5 w-3.5" />
                    <span>
                      {new Intl.NumberFormat("en").format(credits)} credits {annual ? "/year" : "/month"}
                    </span>
                  </div>
                </div>

                {/* Features List */}
                <div className="mt-6 pt-6 border-t border-border space-y-3 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                    What&apos;s included:
                  </span>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-snug">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <div className="mt-8 pt-4">
                  <Link
                    href="/signup"
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs sm:text-sm font-bold shadow-md transition-all duration-200 active:scale-98",
                      plan.popular
                        ? "bg-[#e8603c] hover:bg-[#d4512e] text-white hover:shadow-lg hover:-translate-y-0.5"
                        : "border border-border bg-background hover:bg-surface text-foreground hover:border-foreground/40",
                    )}
                  >
                    <span>Choose {plan.name}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* One-Time Credit Top-Up Packs (Without Pro Plan) */}
        <div className="mt-14 max-w-6xl mx-auto rounded-3xl border border-border bg-gradient-to-b from-surface/80 to-surface/40 p-8 shadow-card">
          <div className="text-center max-w-xl mx-auto">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              <Coins className="h-3 w-3" />
              Pay-As-You-Go Credits
            </span>
            <h3 className="mt-2 text-2xl font-bold text-foreground">
              Need extra credits without a subscription?
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Buy one-time credit top-ups whenever you need extra capacity. Credits never expire and carry no recurring fees.
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-3 max-w-4xl mx-auto">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-surface p-6 text-center shadow-card transition-all duration-200 hover:border-primary/40",
                  pack.popular ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <h4 className="font-bold text-foreground text-base">{pack.name}</h4>
                  {pack.popular && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground min-h-[2.5rem] leading-relaxed">
                  {pack.description}
                </p>

                <div className="my-4">
                  <span className="text-3xl font-black text-foreground">{pack.price}</span>
                  <span className="text-xs text-muted-foreground block mt-0.5">one-time payment</span>
                </div>

                <div className="rounded-xl bg-primary-soft/70 py-2 px-3 mb-5 border border-primary/10">
                  <span className="text-sm font-extrabold text-primary">
                    +{pack.credits} credits
                  </span>
                </div>

                <div className="mt-auto">
                  <Link
                    href="/signup"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background hover:bg-surface py-2.5 text-xs font-bold text-foreground transition-all hover:border-foreground/30"
                  >
                    Get {pack.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Link to Full Plan Comparison */}
        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            <span>Need a feature-by-feature breakdown? View full plan comparison & quota matrix</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* 4 Trust Guarantees */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {GUARANTEES.map((g, idx) => {
            const Icon = g.icon;
            return (
              <div
                key={idx}
                className="group rounded-2xl border border-border bg-surface p-5 text-center transition-all duration-300 hover:border-[#e8603c]/30 hover:shadow-md hover:-translate-y-1"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-[#e8603c] transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="mt-3 font-bold text-foreground text-sm">{g.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
