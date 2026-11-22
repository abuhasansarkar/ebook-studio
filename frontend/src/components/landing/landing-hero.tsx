"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Palette, Sparkles, CheckCircle2, ShieldCheck, Printer } from "lucide-react";

const SUGGESTIONS = [
  { label: "Meal Prep Guide", type: "ebook", query: "30-Day Meal Prep Guide for Busy Professionals" },
  { label: "Cute Woodland Animals", type: "coloring", query: "Cute Woodland Animals Coloring Book for Kids" },
  { label: "Passive Income 101", type: "ebook", query: "Zero to $5K: The Digital Product Blueprint" },
  { label: "Fantasy Mandalas", type: "coloring", query: "Intricate Mythical Creatures & Stained Glass Mandalas" },
  { label: "Mindfulness Journal", type: "ebook", query: "Daily Stoic Journal for Morning Focus" },
];

const ROTATING_PROMPTS = [
  "30-Day Mediterranean Diet Cookbook for Busy Families",
  "Cute Woodland Animals Coloring Book for Toddlers",
  "Zero to $5K: The Solo Creator Playbook",
  "Intricate Fantasy Mandalas & Stained Glass Dragons",
  "Morning Stoic Reflection Journal & Habit Tracker",
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
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Smoothly rotate placeholders when the user has not typed
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % ROTATING_PROMPTS.length);
    }, 3800);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTopic = topic.trim() || ROTATING_PROMPTS[placeholderIndex];
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
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#ffe6dc]/70 via-[#ffebd9]/50 to-transparent blur-3xl"
        aria-hidden
      />

      {/* Floating Micro-Badges on Desktop */}
      <div className="hidden xl:block pointer-events-none absolute left-12 top-28 z-10 animate-float">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface/90 px-4 py-2.5 shadow-lg backdrop-blur-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-[#e8603c]">
            <Printer className="h-4 w-4" />
          </span>
          <div className="text-left">
            <span className="block text-xs font-bold text-foreground">300 DPI Vector Lines</span>
            <span className="block text-[10px] text-muted-foreground">Zero grayscale blur</span>
          </div>
        </div>
      </div>

      <div className="hidden xl:block pointer-events-none absolute right-12 top-36 z-10 animate-float-reverse">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface/90 px-4 py-2.5 shadow-lg backdrop-blur-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="text-left">
            <span className="block text-xs font-bold text-foreground">KDP Bleed & Spine</span>
            <span className="block text-[10px] text-muted-foreground">100% Pre-Flight Verified</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        {/* Top Badge Pill with Subtle Pulse */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e8603c]/20 bg-surface px-4 py-1.5 shadow-sm transition-all hover:border-[#e8603c]/40 hover:shadow-xs">
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
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
          Turn ideas into published eBooks and coloring books in minutes — formatted,
          designed, and ready to sell on Amazon KDP, Etsy, and Gumroad.
        </p>

        {/* Interactive Topic Generator Box with Smooth Micro-Interaction */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="rounded-2xl border-2 border-[#e8603c]/25 bg-surface p-2.5 shadow-xl shadow-[#e8603c]/5 backdrop-blur-sm transition-all duration-300 focus-within:border-[#e8603c] focus-within:ring-4 focus-within:ring-[#e8603c]/15 sm:p-3.5">
            {/* Mode Switcher Pills */}
            <div className="flex items-center gap-1.5 pb-2.5 border-b border-border/60">
              <button
                type="button"
                onClick={() => setMode("ebook")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  mode === "ebook"
                    ? "bg-[#e8603c] text-white shadow-xs scale-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                eBook Studio
              </button>
              <button
                type="button"
                onClick={() => setMode("coloring")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  mode === "coloring"
                    ? "bg-[#e8603c] text-white shadow-xs scale-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                Coloring Book Studio
              </button>
            </div>

            {/* Input & Action Form */}
            <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={ROTATING_PROMPTS[placeholderIndex]}
                  className="w-full bg-transparent px-3 py-2.5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                className="shimmer-mask inline-flex items-center justify-center gap-2 rounded-xl bg-[#e8603c] hover:bg-[#d4512e] px-6 py-3 text-sm font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer shrink-0 group"
              >
                <span>Generate Book</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </form>
          </div>

          {/* Prompt Suggestions with Magnetic Hover Lift */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium text-[11px]">Try:</span>
            {SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handlePickSuggestion(item)}
                className="rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground hover:border-[#e8603c] hover:text-[#a9462c] hover:bg-[#e8603c]/5 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
              >
                &ldquo;{item.label}&rdquo;
              </button>
            ))}
          </div>

          {/* Trust Guarantee Microcopy */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              100 Free credits included
            </span>
            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Amazon KDP & 300 DPI ready
            </span>
          </div>
        </div>

        {/* Supported Marketplace Strip with Hover Lift */}
        <div className="mt-16 border-t border-border/80 pt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your books are instantly formatted and ready to sell on
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 items-center">
            {PLATFORMS.map((platform) => (
              <div
                key={platform.name}
                className="group flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface/50 p-3 text-center transition-all duration-300 hover:border-[#e8603c]/40 hover:bg-surface hover:shadow-md hover:-translate-y-1 cursor-default"
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
