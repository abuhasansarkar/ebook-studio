"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Palette, CheckCircle2, ArrowRight, Eye, ShieldCheck, Sparkles, Layers } from "lucide-react";

export function LandingShowcase() {
  const [activeTab, setActiveTab] = useState<"ebook" | "coloring">("ebook");

  return (
    <section id="showcase" className="py-20 bg-muted/40 border-y border-border/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            WHAT YOU GET
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            See exactly what you'll create
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            From comprehensive, structured non-fiction books to best-selling 300 DPI
            print-ready coloring books — formatted to industry publishing standards.
          </p>

          {/* Tab Selector */}
          <div className="mt-8 inline-flex items-center rounded-xl border border-border bg-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("ebook")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "ebook"
                  ? "bg-[#e8603c] text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Non-Fiction eBook Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("coloring")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "coloring"
                  ? "bg-[#e8603c] text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="h-4 w-4" />
              AI Coloring Book Studio
            </button>
          </div>
        </div>

        {/* Dynamic Showcase Grid */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Card 1: Non-Fiction eBook Showcase */}
          <div
            className={`rounded-2xl border bg-surface p-6 sm:p-8 shadow-card transition-all ${
              activeTab === "ebook"
                ? "border-[#e8603c]/40 ring-2 ring-[#e8603c]/10"
                : "border-border opacity-90"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-bold text-foreground">Meal Prep Guide for Busy Parents</h3>
                  <p className="text-xs text-muted-foreground">Comprehensive Non-Fiction Guide</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-semibold px-2.5 py-0.5 border border-emerald-200">
                KDP & EPUB Ready
              </span>
            </div>

            {/* Visual Preview Box */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
              {/* Book 3D Cover */}
              <div className="sm:col-span-2 relative aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-border bg-gradient-to-br from-amber-500 via-orange-600 to-rose-700 p-4 text-white flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-widest opacity-80">
                  The Complete Blueprint
                </div>
                <div>
                  <h4 className="text-lg font-black leading-tight drop-shadow-md">
                    MEAL PREP
                  </h4>
                  <p className="text-xs font-medium opacity-90 mt-1">FOR BUSY PARENTS</p>
                  <p className="text-[9px] opacity-75 mt-2">30 Easy Dinners • Zero Waste</p>
                </div>
                <div className="text-[9px] font-semibold border-t border-white/20 pt-2 flex justify-between">
                  <span>Author Name</span>
                  <span>14 Chapters</span>
                </div>
              </div>

              {/* Interior Layout & Snippet */}
              <div className="sm:col-span-3 space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3.5 text-xs">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>Chapter 3: The Sunday Batch System</span>
                    <span className="text-[10px] text-muted-foreground">p. 42</span>
                  </div>
                  <p className="text-muted-foreground mt-2 leading-relaxed">
                    "Batch cooking isn't about eating repetitive meals for five days.
                    It's about prepping modular base ingredients that transform in under 10 minutes..."
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface border border-border p-2">
                    <span className="text-muted-foreground block text-[10px]">Total Words</span>
                    <span className="font-bold text-foreground">18,500 Words</span>
                  </div>
                  <div className="rounded-lg bg-surface border border-border p-2">
                    <span className="text-muted-foreground block text-[10px]">Interior Font</span>
                    <span className="font-bold text-foreground">Merriweather Pro</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Auto-generated Clickable Table of Contents</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>6x9 in Paperback PDF & Reflowable EPUB 3</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Full outline & interior verified</span>
              <Link
                href="/app/create?topic=Meal+Prep+Guide+for+Busy+Parents"
                className="text-xs font-semibold text-[#a9462c] hover:text-[#e8603c] inline-flex items-center gap-1"
              >
                Create similar eBook <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Card 2: AI Coloring Book Studio Showcase */}
          <div
            className={`rounded-2xl border bg-surface p-6 sm:p-8 shadow-card transition-all ${
              activeTab === "coloring"
                ? "border-[#e8603c]/40 ring-2 ring-[#e8603c]/10"
                : "border-border opacity-90"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Palette className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-bold text-foreground">Cute Woodland Animals & Fairies</h3>
                  <p className="text-xs text-muted-foreground">300 DPI Print-Ready Coloring Book</p>
                </div>
              </div>
              <span className="rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-xs font-semibold px-2.5 py-0.5 border border-orange-200">
                100% Crisp Vector Lines
              </span>
            </div>

            {/* Visual Preview Box */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
              {/* Full-wrap Cover Thumbnail */}
              <div className="sm:col-span-2 relative aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-border bg-gradient-to-br from-teal-500 via-indigo-600 to-purple-800 p-4 text-white flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-widest opacity-80">
                  Coloring Book for Kids & Adults
                </div>
                <div>
                  <h4 className="text-lg font-black leading-tight drop-shadow-md">
                    WOODLAND
                  </h4>
                  <p className="text-xs font-medium opacity-90 mt-1">ANIMALS & MAGIC</p>
                  <p className="text-[9px] opacity-75 mt-2">40 Adorable Hand-Curated Scenes</p>
                </div>
                <div className="text-[9px] font-semibold border-t border-white/20 pt-2 flex justify-between">
                  <span>8.5 × 11 in</span>
                  <span>Pure White Interior</span>
                </div>
              </div>

              {/* High-Resolution Line Art Interior Preview */}
              <div className="sm:col-span-3 space-y-3">
                <div className="rounded-lg border-2 border-dashed border-border bg-white p-3 text-center shadow-inner">
                  {/* Clean SVG Vector Line Art Representation */}
                  <div className="h-28 flex items-center justify-center">
                    <svg
                      viewBox="0 0 100 100"
                      className="h-full w-auto text-black"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {/* Stylized Cute Bear Line Art Outline */}
                      <path d="M 30,35 A 15,15 0 0,1 20,20 A 15,15 0 0,1 35,28" />
                      <path d="M 70,35 A 15,15 0 0,0 80,20 A 15,15 0 0,0 65,28" />
                      <ellipse cx="50" cy="50" rx="30" ry="26" />
                      <circle cx="40" cy="45" r="3" fill="currentColor" />
                      <circle cx="60" cy="45" r="3" fill="currentColor" />
                      <ellipse cx="50" cy="54" rx="8" ry="5" />
                      <path d="M 50,56 L 50,60" />
                      <path d="M 44,60 Q 50,65 56,60" />
                      {/* Cute flower embellishment */}
                      <circle cx="32" cy="74" r="5" />
                      <circle cx="68" cy="74" r="5" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider block mt-1">
                    Zero Grayscale Fuzz • Pure #FFFFFF Background
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface border border-border p-2">
                    <span className="text-muted-foreground block text-[10px]">Trim Size</span>
                    <span className="font-bold text-foreground">8.5 × 11 inches</span>
                  </div>
                  <div className="rounded-lg bg-surface border border-border p-2">
                    <span className="text-muted-foreground block text-[10px]">Print Resolution</span>
                    <span className="font-bold text-foreground">300 DPI Vector</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Single-page prompt editing & 1-click regenerate</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Calculated spine width with bleed margins for KDP</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">KDP low-content print compliant</span>
              <Link
                href="/app/coloring-book/create?title=Cute+Woodland+Animals"
                className="text-xs font-semibold text-[#a9462c] hover:text-[#e8603c] inline-flex items-center gap-1"
              >
                Create similar Coloring Book <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
