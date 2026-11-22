import Link from "next/link";
import { ArrowRight, Sparkles, Sliders, FileDown } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Describe your idea",
    description:
      "Enter a title, topic, or niche. Choose between a rich non-fiction guide or an illustrated coloring book. Our AI generates a market-researched outline and chapter plan in seconds.",
    preview: {
      type: "input",
      tag: "Free Outline Planning",
      items: ["Topic: Habit Building Blueprint", "Audience: Busy Freelancers", "Length: 12 Chapters"],
    },
  },
  {
    number: "02",
    title: "Generate & customize",
    description:
      "Review the outline or coloring page grid. Generate full chapters section-by-section or render pure 300 DPI line art. Regenerate single pages or edit text directly in the studio.",
    preview: {
      type: "editor",
      tag: "Live Studio Generation",
      items: ["Interactive Page Grid", "1-Click Single Page Regenerate", "Pure #FFFFFF Background"],
    },
  },
  {
    number: "03",
    title: "Export & sell everywhere",
    description:
      "Download a comprehensive publisher package: KDP Print PDF, EPUB for Apple & Google, full-wrap cover with calculated spine, and Etsy digital download kits.",
    preview: {
      type: "export",
      tag: "1-Click Publisher Bundle",
      items: ["Amazon KDP Print PDF", "Reflowable EPUB 3.3", "Etsy 300 DPI PNG Pack"],
    },
  },
];

export function LandingSteps() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30 border-y border-border/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            SIMPLE PROCESS
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Three steps from your idea to a published book.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            No design degrees or formatting headaches required. eBookStudio handles the technical publishing heavy lifting.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="relative flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 shadow-card transition-all hover:border-[#e8603c]/40 hover:shadow-md"
            >
              <div>
                {/* Step Number Badge */}
                <div className="flex items-center justify-between pb-6 border-b border-border">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft font-mono text-base font-bold text-[#e8603c]">
                    {step.number}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {step.preview.tag}
                  </span>
                </div>

                {/* Mockup Preview Box */}
                <div className="my-6 rounded-xl border border-border/80 bg-muted/40 p-4">
                  <div className="space-y-2 text-xs">
                    {step.preview.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 border border-border/60 text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">{item}</span>
                        <span className="text-[10px] text-emerald-600 font-bold">READY</span>
                      </div>
                    ))}
                  </div>
                </div>

                <h3 className="text-xl font-bold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#a9462c] hover:text-[#e8603c]"
                >
                  Start step {step.number} free <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
