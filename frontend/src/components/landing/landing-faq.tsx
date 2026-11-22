"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

const FAQS = [
  {
    q: "Do I really own 100% of the commercial rights to books I create?",
    a: "Yes, completely. Every manuscript, chapter, illustration, coloring page, and cover created inside eBookStudio belongs to you under a full commercial license. You are free to sell them on Amazon KDP, Etsy, Gumroad, your personal Shopify store, or through physical print-on-demand services without paying royalties to us.",
  },
  {
    q: "Will my coloring books and eBooks pass Amazon KDP's print checks?",
    a: "Yes. Our automated preflight engine formats interior PDFs with precise trim dimensions (such as standard 6×9 in or 8.5×11 in), embeds required gutter margins to prevent text from being lost in the binding spine, and applies standard 0.125-inch bleeds. The coloring pages are exported at 300 DPI to eliminate pixelation and blur rejections.",
  },
  {
    q: "What makes the AI Coloring Book Studio lines clean without grayscale blur?",
    a: "Traditional AI image models generate subtle gray shadows, blurred antialiasing, and smudged backgrounds that ruin coloring books when printed. eBookStudio applies an automated black-and-white threshold filter and vector smoothing pass that forces all backgrounds to pure #FFFFFF white and all stroke lines to pure high-contrast black.",
  },
  {
    q: "Can I edit and regenerate individual pages without rewriting the whole book?",
    a: "Yes! In the Coloring Book Studio, our visual grid allows you to click on any specific page, adjust its individual prompt or style parameters, and regenerate only that page in seconds without modifying any other page in your project. In the eBook Studio, you can rewrite, expand, or proofread any paragraph or section individually.",
  },
  {
    q: "Which file formats do I receive upon export?",
    a: "Depending on your project type, you receive: (1) Amazon KDP Print-Ready Interior PDF, (2) Calculated Full-Wrap Cover PDF with spine and bleed, (3) Reflowable EPUB 3.3 for Apple Books, Kobo, and Google Play, (4) Formatted Microsoft Word DOCX, and (5) Individual 300 DPI PNG bundles ideal for Etsy digital download packages.",
  },
  {
    q: "How does the free plan work?",
    a: "When you sign up, you automatically receive 100 free generation credits with zero credit card required. You can research, outline, and write full sample chapters or generate coloring pages to inspect print quality before deciding to upgrade to our Creator Tier.",
  },
];

export function LandingFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-24 bg-muted/30 border-y border-border/80">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Questions? We've got answers.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Everything you need to know about commercial publishing, file compliance, and royalties.
          </p>
        </div>

        {/* Accordion List */}
        <div className="mt-14 space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface shadow-xs transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-bold text-foreground pr-4">
                    {faq.q}
                  </span>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-[#e8603c]/15 text-[#e8603c]" : "text-muted-foreground"
                    }`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-6 pt-0 text-sm text-muted-foreground leading-relaxed sm:px-6 border-t border-border/50">
                    <p className="mt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
