"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, X, ShieldCheck, Zap } from "lucide-react";
import { type Plan } from "@ebook/shared";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { usePlans, useStartCheckout } from "@/lib/queries";
import { cn, formatNumber } from "@/lib/utils";

interface ProPlansModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

const PRO_FEATURES = [
  "Unlimited PDF, EPUB 3.3, and DOCX exports",
  "Amazon KDP 300 DPI print-ready interior generation",
  "Full AI Non-Fiction, Fiction & Coloring Book Studios",
  "100% Commercial rights & full royalty ownership",
  "Priority AI queue handling & higher chapter quotas",
  "Cancel or change plans anytime with no penalty",
];

export function ProPlansModal({
  open,
  onClose,
  title = "Unlock Unlimited Print & eBook Exports",
  description = "Exporting files requires an active Pro plan. Pick the credits that fit your goals — upgrade now to download your complete book.",
}: ProPlansModalProps) {
  const router = useRouter();
  const plansQuery = usePlans();
  const checkout = useStartCheckout();
  const [annual, setAnnual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const catalog = plansQuery.data?.plans ?? [];
  const proPlans = catalog.filter((p) => {
    if (!p.recurring) return false;
    const isYearly = p.interval === "year" || p.id.endsWith("-yearly");
    return annual ? isYearly : !isYearly;
  });

  const handleSelectPlan = (planId: string) => {
    setError(null);
    checkout.mutate(planId, {
      onSuccess: (result) => {
        const url = result.checkout.url;
        if (url) {
          if (url.startsWith("http://") || url.startsWith("https://")) {
            window.location.href = url;
          } else {
            router.push(url);
          }
        }
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl rounded-3xl border border-border bg-surface p-6 sm:p-8 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-bold text-primary mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            PRO PLANS
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-background p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer",
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
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer",
                annual
                  ? "bg-[#e8603c] text-white shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>Annual billing</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider",
                  annual
                    ? "bg-white/20 text-white"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                )}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger-soft p-3 text-center text-xs font-medium text-danger">
            {error}
          </div>
        )}

        {/* 3 Pro Plan Cards Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {proPlans.map((plan) => {
            const isPopular = plan.id.startsWith("author");
            const isYearly = plan.interval === "year" || plan.id.endsWith("-yearly");
            const monthlyPrice = isYearly ? Math.round(plan.priceMinor / 12) : plan.priceMinor;
            const isPending = checkout.isPending && checkout.variables === plan.id;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-5 transition-all duration-200",
                  isPopular
                    ? "border-[#e8603c] ring-2 ring-[#e8603c]/20 bg-[#e8603c]/5 shadow-md"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#e8603c] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                    Popular
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-base text-foreground">{plan.name}</h3>
                  {isYearly && (
                    <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                      Save 20%
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-foreground">
                      ${(monthlyPrice / 100).toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">/mo</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {isYearly
                      ? `Billed annually ($${(plan.priceMinor / 100).toFixed(0)}/yr)`
                      : "Billed monthly, cancel anytime"}
                  </p>
                </div>

                <div className="mt-3 rounded-lg bg-surface/80 p-2 text-center border border-border/60">
                  <span className="text-xs font-extrabold text-foreground font-mono">
                    {formatNumber(plan.credits)}
                  </span>
                  <span className="text-xs text-muted-foreground"> credits {isYearly ? "/yr" : "/mo"}</span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {plan.description}
                </p>

                <Button
                  className={cn(
                    "mt-5 w-full text-xs font-bold",
                    isPopular ? "bg-[#e8603c] hover:bg-[#d4512e] text-white" : "",
                  )}
                  loading={isPending}
                  disabled={checkout.isPending}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  Choose {plan.name.replace(/ \(Annual\)/, "")}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Feature Highlights Checklist */}
        <div className="mt-6 pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          {PRO_FEATURES.map((feat, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{feat}</span>
            </div>
          ))}
        </div>

        {/* Footer Alternative Link */}
        <div className="mt-5 text-center text-xs text-muted-foreground border-t border-border/60 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Every plan includes full commercial export rights.</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/app/credits#top-up");
            }}
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            Just need extra credits without a monthly plan? Buy credit packs →
          </button>
        </div>
      </div>
    </div>
  );
}
