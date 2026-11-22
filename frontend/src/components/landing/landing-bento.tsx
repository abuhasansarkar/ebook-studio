import { Sparkles, Layers, ShieldCheck, Palette, Wand2, FileDown, CheckCircle2 } from "lucide-react";

export function LandingBento() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            POWERFUL FEATURES
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Everything you need to publish and profit.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Every tool required to research, outline, write, illustrate, format,
            and package commercial books in one unified SaaS workspace.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: AI Content Generation (Spans 2 cols on desktop) */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-7 sm:p-9 shadow-card relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-[#e8603c] dark:bg-orange-950 dark:text-orange-400">
                  <Wand2 className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-[#a9462c]">
                  Deep Outline & Section Generator
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-bold text-foreground">
                Structure & write entire chapters in minutes
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Break books down into coherent chapters, sub-headings, and practical steps.
                Our contextual engine remembers earlier chapters so your books stay consistent without repetitive filler.
              </p>
            </div>

            {/* Visual Widget Preview */}
            <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 relative">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground pb-3 border-b border-border">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Generating: Chapter 4 — The Growth Engine
                </span>
                <span className="text-muted-foreground">1,850 / 2,000 words</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-2 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[85%]" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>✓ Approved Outline</span>
                  <span>✓ Fact & Citation Check</span>
                  <span>✓ Style & Tone Anchored</span>
                  <span>92% Complete</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Cover Studio & 3D Mockups */}
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-9 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                  <Layers className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Full-Wrap Cover Studio
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold text-foreground">
                Professional covers that actually sell
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Automatic spine calculation based on exact page count and paper stock (cream vs white).
                Exports full-wrap print PDFs and photorealistic 3D promotional mockups.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-gradient-to-tr from-orange-50 to-amber-50 dark:from-stone-900 dark:to-stone-850 p-4 text-center">
              <div className="text-xs font-semibold text-foreground">Amazon KDP Spine Calculator</div>
              <div className="mt-2 text-xl font-mono font-bold text-[#e8603c]">
                0.274 in <span className="text-xs text-muted-foreground font-normal">Spine Width</span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                120 pages • 50lb White Paper • 0.125" Bleed Auto-Included
              </div>
            </div>
          </div>

          {/* Card 3: Dedicated AI Coloring Book Studio */}
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-9 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-[#e8603c] dark:bg-orange-950 dark:text-orange-400">
                  <Palette className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-[#a9462c]">
                  AI Coloring Book Studio
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold text-foreground">
                12 Curated styles with pure 300 DPI lines
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose from Kawaii, Stained Glass, Mandalas, Fantasy, or Thick Toddler Outlines.
                Every page is processed through our black/white contrast optimizer for pure vector clarity.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-surface p-2.5">
                <span className="text-[10px] text-muted-foreground block">Artistic Presets</span>
                <span className="font-bold text-foreground">12 Styles</span>
              </div>
              <div className="rounded-lg border border-border bg-surface p-2.5">
                <span className="text-[10px] text-muted-foreground block">Single Page Edit</span>
                <span className="font-bold text-foreground">1-Click Regenerate</span>
              </div>
            </div>
          </div>

          {/* Card 4: Multi-Platform Export & Quality Review (Spans 2 cols on desktop) */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-7 sm:p-9 shadow-card relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Automated Quality Audit
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-bold text-foreground">
                Zero-rejection Amazon KDP & print-ready packaging
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Before you download, our automated pre-flight audit inspects your files against strict KDP,
                Etsy, and IngramSpark print standards.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/40 dark:border-emerald-800 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  KDP Gutter Margins
                </div>
                <p className="mt-1 text-muted-foreground text-[11px]">
                  0.375" inner gutter safely accommodates book spine binding.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/40 dark:border-emerald-800 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  300 DPI Resolution
                </div>
                <p className="mt-1 text-muted-foreground text-[11px]">
                  Interior line art passes high-resolution raster and vector tests.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/40 dark:border-emerald-800 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Commercial Licensing
                </div>
                <p className="mt-1 text-muted-foreground text-[11px]">
                  All generated art and text include full 100% royalty rights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
