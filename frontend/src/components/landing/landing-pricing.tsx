"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Sparkles, ArrowRight, Zap, RefreshCw, Lock } from "lucide-react";

const PLAN_FEATURES = [
  "Unlimited book outlines & structure generation",
  "1,000 Generation credits per month (eBooks & Coloring)",
  "Full Non-Fiction eBook Studio (Rich editor, citations)",
  "Full AI Coloring Book Studio (12 curated art styles)",
  "300 DPI vector-clean PDF print interiors",
  "Automated Amazon KDP spine width & bleed calculator",
  "Full-wrap cover generation (Front, Spine, Back)",
  "100% Commercial rights & royalty ownership forever",
  "Export to KDP Print PDF, EPUB 3.3, and DOCX",
  "Single-page prompt editing & 1-click regeneration",
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
    desc: "You own all text, covers, and illustrations royalty-free.",
  },
  {
    icon: RefreshCw,
    title: "Cancel Anytime",
    desc: "No long-term contracts. Your credits and files remain yours.",
  },
  {
    icon: Lock,
    title: "256-Bit SSL Checkout",
    desc: "Bank-grade encrypted processing via Stripe.",
  },
];

export function LandingPricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="py-24 bg-background relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary transition-transform hover:scale-105">
            <Sparkles className="h-3 w-3" />
            TRANSPARENT PRICING
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Plans from $19/mo, pay only when you're ready to sell.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
            Start completely free with 100 credits. Upgrade to unlock full-resolution commercial exports and unlimited generation.
          </p>

          {/* Billing Cycle Toggle with Lively Pill Animation */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 cursor-pointer ${
                !annual
                  ? "bg-foreground text-background shadow-xs scale-100"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly billing
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 cursor-pointer ${
                annual
                  ? "bg-[#e8603c] text-white shadow-xs scale-100"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Annual billing</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider animate-pulse-subtle">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Featured Pricing Card with Glow & Hover Lift */}
        <div className="mt-14 max-w-xl mx-auto">
          <div className="group relative rounded-3xl border-2 border-[#e8603c] bg-surface p-8 sm:p-10 shadow-2xl shadow-[#e8603c]/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#e8603c]/20">
            {/* Ribbon */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#e8603c] to-[#ff7854] px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              Most Popular • Creator Tier
            </div>

            <div className="text-center pt-2">
              <h3 className="text-2xl font-black text-foreground">Creator All-Access</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Everything you need to write, illustrate, and publish unlimited commercial titles.
              </p>

              <div className="mt-6 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black tracking-tight text-foreground transition-all duration-300">
                  {annual ? "$15" : "$19"}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">/ month</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {annual ? "Billed annually ($180/yr) • 2 months free" : "Billed monthly, cancel anytime"}
              </p>

              <Link
                href="/signup"
                className="shimmer-mask mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8603c] hover:bg-[#d4512e] py-3.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-98 group/btn"
              >
                <span>Start Free (100 Welcome Credits)</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
              </Link>
              <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <Link href="/pricing" className="hover:text-foreground font-medium underline underline-offset-4">
                  Compare all plans & quotas →
                </Link>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Instant access • Includes 100 welcome credits • Cancel anytime
              </p>
            </div>

            {/* Checklist */}
            <div className="mt-8 pt-8 border-t border-border space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground block">
                Everything Included:
              </span>
              {PLAN_FEATURES.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-tight">{feature}</span>
                </div>
              ))}
            </div>
          </div>
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
