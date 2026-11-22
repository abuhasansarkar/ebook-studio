import { Sparkles, Globe2, BookOpen, ShoppingBag, Store, Tablet, ArrowUpRight } from "lucide-react";

const CHANNELS = [
  {
    name: "Amazon KDP",
    desc: "Paperback Print PDF + Kindle KPF",
    badge: "Largest Marketplace",
    icon: BookOpen,
  },
  {
    name: "Etsy Printables",
    desc: "300 DPI Coloring Packs & Activity Sheets",
    badge: "High Margin",
    icon: Store,
  },
  {
    name: "Gumroad",
    desc: "Direct Digital Sales with 0% Setup",
    badge: "Direct Creator",
    icon: ShoppingBag,
  },
  {
    name: "Apple Books",
    desc: "Reflowable EPUB 3.3 for iPad & Mac",
    badge: "Global Reach",
    icon: Tablet,
  },
  {
    name: "Shopify Store",
    desc: "Sell eBooks Directly on Your Domain",
    badge: "Custom Brand",
    icon: Globe2,
  },
];

export function LandingDistribution() {
  return (
    <section className="py-24 bg-muted/40 border-y border-border/80 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary transition-transform hover:scale-105">
            <Sparkles className="h-3 w-3" />
            GLOBAL DISTRIBUTION
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Your book, ready for every platform you sell on.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
            No need to reformat for five different stores. eBookStudio produces pre-flighted files
            compliant with every major distribution channel.
          </p>
        </div>

        {/* Central Radial / Ecosystem Visualization */}
        <div className="mt-16 max-w-4xl mx-auto">
          <div className="relative rounded-3xl border border-border bg-surface p-8 sm:p-12 shadow-card overflow-hidden">
            {/* Multi-layered Concentric Radial Rings with Animation */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e8603c]/20 animate-orbit"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#e8603c]/10"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8603c]/5 blur-2xl"
              aria-hidden
            />

            {/* Central Node */}
            <div className="flex flex-col items-center justify-center text-center relative z-10 pb-10">
              <div className="group relative flex h-20 w-20 items-center justify-center rounded-3xl bg-[#e8603c] text-white shadow-xl shadow-[#e8603c]/25 ring-8 ring-primary-soft transition-transform duration-300 hover:scale-105">
                <svg viewBox="0 0 24 24" className="h-10 w-10 transition-transform duration-300 group-hover:rotate-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13" />
                  <path d="M9 8h6M9 12h4" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-black text-foreground">eBookStudio Engine</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Single source of truth. Automatic typesetting, DPI upscaling, and format conversion.
              </p>
            </div>

            {/* Connected Marketplaces Grid with Micro-Interactions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10 pt-4 border-t border-border">
              {CHANNELS.map((ch) => {
                const IconComponent = ch.icon;
                return (
                  <div
                    key={ch.name}
                    className="group rounded-2xl border border-border bg-muted/30 p-4 transition-all duration-300 hover:bg-surface hover:border-[#e8603c]/40 hover:shadow-md hover:-translate-y-1 cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border text-[#e8603c] shadow-xs group-hover:scale-110 group-hover:bg-[#e8603c] group-hover:text-white transition-all duration-300">
                        <IconComponent className="h-4 w-4" />
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-surface px-2.5 py-0.5 rounded-full border border-border/60 group-hover:border-[#e8603c]/40 group-hover:text-[#a9462c] transition-colors">
                        {ch.badge}
                      </span>
                    </div>
                    <div className="mt-3">
                      <h4 className="font-bold text-foreground text-sm flex items-center justify-between">
                        <span>{ch.name}</span>
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-200" />
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{ch.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
