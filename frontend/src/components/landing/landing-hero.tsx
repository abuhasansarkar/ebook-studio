"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Palette, Sparkles, CheckCircle2 } from "lucide-react";

const SUGGESTIONS = [
  { label: "Meal Prep Guide", type: "ebook", query: "30-Day Meal Prep Guide for Busy Professionals" },
  { label: "Cute Woodland Animals", type: "coloring", query: "Cute Woodland Animals Coloring Book for Kids" },
  { label: "Passive Income 101", type: "ebook", query: "Zero to $5K: The Digital Product Blueprint" },
  { label: "Fantasy Mandalas", type: "coloring", query: "Intricate Mythical Creatures & Stained Glass Mandalas" },
  { label: "Mindfulness Journal", type: "ebook", query: "Daily Stoic Journal for Morning Focus" },
];

const PLATFORMS = [
  { name: "Amazon KDP", note: "Paperback & Kindle" },
  { name: "Etsy", note: "Printable PDFs & Bundles" },
  { name: "Gumroad", note: "Direct Creator Sales" },
  { name: "Apple Books", note: "Standard EPUB 3" },
  { name: "Shopify", note: "Digital Download Stores" },
  { name: "Barnes & Noble", note: "NOOK & Print on Demand" },
];

export function LandingHero() {
  const router = useRouter();
  const [mode, setMode] = useState<"ebook" | "coloring">("ebook");
  const [topic, setTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTopic = topic.trim();
    if (mode === "coloring" || /coloring|mandala|drawing|kids book|line art/i.test(cleanTopic)) {
      router.push(`/app/coloring-book/create${cleanTopic ? `?title=${encodeURIComponent(cleanTopic)}` : ""}`);
    } else {
      router.push(`/app/create${cleanTopic ? `?topic=${encodeURIComponent(cleanTopic)}` : ""}`);
    }
  };

  const handlePickSuggestion = (s: typeof SUGGESTIONS[0]) => {
    setMode(s.type as "ebook" | "coloring");
    setTopic(s.query);
    if (s.type === "coloring") {
      router.push(`/app/coloring-book/create?title=${encodeURIComponent(s.query)}`);
    } else {
      router.push(`/app/create?topic=${encodeURIComponent(s.query)}`);
    }
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
      {/* Background Ambient Glows */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#ffe6dc]/60 via-[#ffebd9]/40 to-transparent blur-3xl"
        aria-hidden
      />

      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        {/* Top Badge Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-[#e8603c] animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#a9462c]">
            New Release
          </span>
          <span className="text-muted-foreground text-xs">•</span>
          <span className="text-xs font-medium text-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#e8603c]" />
            AI-Powered eBook & Coloring Studio
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="mt-8 text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          Write it once.{" "}
          <span className="bg-gradient-to-r from-[#e8603c] via-[#ff6b4a] to-[#ff8c42] bg-clip-text text-transparent">
            Let it earn forever.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Turn ideas into published eBooks and coloring books in minutes — formatted,
          designed, and ready to sell on Amazon KDP, Etsy, and Gumroad.
        </p>

        {/* Interactive Topic Generator Box */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="rounded-2xl border-2 border-[#e8603c]/20 bg-surface p-2 shadow-xl shadow-[#e8603c]/5 backdrop-blur-sm sm:p-3">
            {/* Mode Switcher Pills */}
            <div className="flex items-center gap-1.5 pb-2 border-b border-border/60">
              <button
                type="button"
                onClick={() => setMode("ebook")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  mode === "ebook"
                    ? "bg-[#e8603c] text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                eBook Studio
              </button>
              <button
                type="button"
                onClick={() => setMode("coloring")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  mode === "coloring"
                    ? "bg-[#e8603c] text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                Coloring Book Studio
              </button>
            </div>

            {/* Input & Action Form */}
            <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={
                  mode === "ebook"
                    ? "e.g. 30-Day Mediterranean Diet Cookbook or SaaS Growth Guide..."
                    : "e.g. Cute Woodland Animals or Stained Glass Mandalas..."
                }
                className="flex-1 bg-transparent px-3 py-2.5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e8603c] hover:bg-[#d4512e] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:shadow cursor-pointer shrink-0"
              >
                <span>Generate Book</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Prompt Suggestions */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium">Try:</span>
            {SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handlePickSuggestion(item)}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-muted-foreground hover:border-[#e8603c] hover:text-[#a9462c] transition-colors cursor-pointer"
              >
                "{item.label}"
              </button>
            ))}
          </div>

          {/* Trust Guarantee Microcopy */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              100 Free credits included
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Amazon KDP & 300 DPI ready
            </span>
          </div>
        </div>

        {/* Supported Marketplace Strip */}
        <div className="mt-16 border-t border-border/80 pt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your books are instantly formatted and ready to sell on
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 items-center">
            {PLATFORMS.map((platform) => (
              <div
                key={platform.name}
                className="group flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface/50 p-3 text-center transition-all hover:border-border hover:bg-surface hover:shadow-xs"
              >
                <span className="text-sm font-bold text-foreground group-hover:text-[#a9462c] transition-colors">
                  {platform.name}
                </span>
                <span className="text-[11px] text-muted-foreground">{platform.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
