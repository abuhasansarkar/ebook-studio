"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Palette, CheckCircle2, ArrowRight, Sparkles, ZoomIn, Search, Check } from "lucide-react";

export function LandingShowcase() {
  const [activeTab, setActiveTab] = useState<"ebook" | "coloring">("ebook");
  const [inspectZoom, setInspectZoom] = useState(false);

  return (
    <section id="showcase" className="py-24 bg-muted/40 border-y border-border/80 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary transition-transform hover:scale-105">
            <Sparkles className="h-3 w-3" />
            WHAT YOU GET
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            See exactly what you&apos;ll create
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
            From comprehensive, structured non-fiction books to best-selling 300 DPI
            print-ready coloring books — formatted to industry publishing standards.
          </p>

          {/* Tab Selector with Smooth Transition */}
          <div className="mt-8 inline-flex items-center rounded-2xl border border-border bg-surface p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("ebook")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 cursor-pointer ${
                activeTab === "ebook"
                  ? "bg-[#e8603c] text-white shadow-md scale-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Non-Fiction eBook Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("coloring")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 cursor-pointer ${
                activeTab === "coloring"
                  ? "bg-[#e8603c] text-white shadow-md scale-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Palette className="h-4 w-4" />
              AI Coloring Book Studio
            </button>
          </div>
        </div>

        {/* Dynamic Showcase Grid */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Card 1: Non-Fiction eBook Showcase */}
          <div
            className={`group rounded-3xl border bg-surface p-6 sm:p-8 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl flex flex-col justify-between ${
              activeTab === "ebook"
                ? "border-[#e8603c]/50 ring-2 ring-[#e8603c]/10"
                : "border-border opacity-95"
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary group-hover:scale-110 transition-transform duration-300">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-foreground text-lg">Meal Prep Guide for Busy Parents</h3>
                    <p className="text-xs text-muted-foreground">Comprehensive Non-Fiction Guide</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-semibold px-3 py-1 border border-emerald-200">
                  KDP & EPUB Ready
                </span>
              </div>

              {/* Visual Preview Box */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-5 items-center">
                {/* Book 3D Cover */}
                <div className="sm:col-span-2 relative aspect-[3/4] rounded-2xl overflow-hidden shadow-xl border border-border bg-gradient-to-br from-amber-500 via-orange-600 to-rose-700 p-5 text-white flex flex-col justify-between group-hover:rotate-1 transition-transform duration-300">
                  <div className="text-[10px] uppercase font-bold tracking-widest opacity-85">
                    The Complete Blueprint
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight drop-shadow-md">
                      MEAL PREP
                    </h4>
                    <p className="text-xs font-semibold opacity-95 mt-1">FOR BUSY PARENTS</p>
                    <p className="text-[10px] opacity-80 mt-2">30 Easy Dinners • Zero Waste</p>
                  </div>
                  <div className="text-[10px] font-semibold border-t border-white/20 pt-2 flex justify-between">
                    <span>Sarah Jenkins</span>
                    <span>14 Chapters</span>
                  </div>
                </div>

                {/* Interior Layout & Snippet */}
                <div className="sm:col-span-3 space-y-3.5">
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs transition-colors hover:bg-muted/60">
                    <div className="font-semibold text-foreground flex items-center justify-between">
                      <span>Chapter 3: The Sunday Batch System</span>
                      <span className="text-[10px] font-mono text-muted-foreground">p. 42</span>
                    </div>
                    <p className="text-muted-foreground mt-2 leading-relaxed">
                      &ldquo;Batch cooking isn&apos;t about eating repetitive meals for five days.
                      It&apos;s about prepping modular base ingredients that transform in under 10 minutes...&rdquo;
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-surface border border-border p-3 transition-colors hover:border-[#e8603c]/30">
                      <span className="text-muted-foreground block text-[10px]">Total Words</span>
                      <span className="font-bold text-foreground text-sm">18,500 Words</span>
                    </div>
                    <div className="rounded-xl bg-surface border border-border p-3 transition-colors hover:border-[#e8603c]/30">
                      <span className="text-muted-foreground block text-[10px]">Interior Font</span>
                      <span className="font-bold text-foreground text-sm">Merriweather Pro</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Auto-generated Clickable Table of Contents</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>6x9 in Paperback PDF & Reflowable EPUB 3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Full outline & interior verified</span>
              <Link
                href="/app/create?topic=Meal+Prep+Guide+for+Busy+Parents"
                className="text-xs font-bold text-[#a9462c] hover:text-[#e8603c] inline-flex items-center gap-1 group/btn"
              >
                <span>Create similar eBook</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Card 2: AI Coloring Book Studio Showcase */}
          <div
            className={`group rounded-3xl border bg-surface p-6 sm:p-8 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl flex flex-col justify-between ${
              activeTab === "coloring"
                ? "border-[#e8603c]/50 ring-2 ring-[#e8603c]/10"
                : "border-border opacity-95"
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary group-hover:scale-110 transition-transform duration-300">
                    <Palette className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-foreground text-lg">Cute Woodland Animals & Fairies</h3>
                    <p className="text-xs text-muted-foreground">300 DPI Print-Ready Coloring Book</p>
                  </div>
                </div>
                <span className="rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-xs font-semibold px-3 py-1 border border-orange-200">
                  100% Crisp Vector Lines
                </span>
              </div>

              {/* Visual Preview Box with Interactive Quality Inspection */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-5 items-center">
                {/* Full-wrap Cover Thumbnail */}
                <div className="sm:col-span-2 relative aspect-[3/4] rounded-2xl overflow-hidden shadow-xl border border-border bg-gradient-to-br from-teal-500 via-indigo-600 to-purple-800 p-5 text-white flex flex-col justify-between group-hover:-rotate-1 transition-transform duration-300">
                  <div className="text-[10px] uppercase font-bold tracking-widest opacity-85">
                    Coloring Book for Kids & Adults
                  </div>
                  <div>
                    <h4 className="text-xl font-black leading-tight drop-shadow-md">
                      WOODLAND
                    </h4>
                    <p className="text-xs font-semibold opacity-95 mt-1">ANIMALS & MAGIC</p>
                    <p className="text-[10px] opacity-80 mt-2">40 Adorable Hand-Curated Scenes</p>
                  </div>
                  <div className="text-[10px] font-semibold border-t border-white/20 pt-2 flex justify-between">
                    <span>8.5 × 11 in</span>
                    <span>Pure White Interior</span>
                  </div>
                </div>

                {/* High-Resolution Line Art Interior Preview */}
                <div className="sm:col-span-3 space-y-3.5">
                  <div className="relative rounded-2xl border-2 border-dashed border-border bg-white p-3.5 text-center shadow-inner group/art">
                    {/* Interactive Zoom Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setInspectZoom(!inspectZoom)}
                      className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-zinc-900/80 text-white px-2 py-0.5 text-[10px] font-medium backdrop-blur-xs hover:bg-zinc-900 transition-all cursor-pointer shadow-xs"
                    >
                      <Search className="h-3 w-3" />
                      {inspectZoom ? "Normal View" : "300 DPI Loupe"}
                    </button>

                    {/* Vector Line Art Representation */}
                    <div className={`h-28 flex items-center justify-center transition-transform duration-300 ${inspectZoom ? "scale-140" : "scale-100"}`}>
                      <svg
                        viewBox="0 0 100 100"
                        className="h-full w-auto text-black transition-all"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={inspectZoom ? "3.2" : "2.5"}
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
                        <circle cx="32" cy="74" r="5" />
                        <circle cx="68" cy="74" r="5" />
                      </svg>
                    </div>

                    <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider block mt-1">
                      {inspectZoom ? "🔍 Verified 300 DPI • Zero Grayscale Artifacts" : "Pure #FFFFFF Background • Heavy Ink Outlines"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-surface border border-border p-3 transition-colors hover:border-[#e8603c]/30">
                      <span className="text-muted-foreground block text-[10px]">Trim Size</span>
                      <span className="font-bold text-foreground text-sm">8.5 × 11 in</span>
                    </div>
                    <div className="rounded-xl bg-surface border border-border p-3 transition-colors hover:border-[#e8603c]/30">
                      <span className="text-muted-foreground block text-[10px]">Print Resolution</span>
                      <span className="font-bold text-foreground text-sm">300 DPI Vector</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Single-page prompt editing & 1-click regenerate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Calculated spine width with bleed margins for KDP</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">KDP low-content print compliant</span>
              <Link
                href="/app/coloring-book/create?title=Cute+Woodland+Animals"
                className="text-xs font-bold text-[#a9462c] hover:text-[#e8603c] inline-flex items-center gap-1 group/btn"
              >
                <span>Create similar Coloring Book</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
