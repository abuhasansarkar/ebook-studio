"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Star,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TESTIMONIALS = [
  {
    name: "Sarah Jenkins",
    role: "KDP Low-Content Publisher",
    avatar: "SJ",
    income: "$4,280 in 60 Days",
    growth: "+210%",
    platform: "Amazon KDP",
    quote:
      "I published 4 animal coloring books with eBookStudio. The line art came out razor-sharp with pure white backgrounds — zero Amazon print quality rejections. My second book became an Amazon category best-seller!",
    chart: [30, 45, 60, 80, 95, 120, 150],
  },
  {
    name: "Marcus Vance",
    role: "Digital Entrepreneur & Writer",
    avatar: "MV",
    income: "1,420+ Copies Sold",
    growth: "+185%",
    platform: "Gumroad & Twitter",
    quote:
      "Drafting a 15,000-word SaaS playbook used to take me two months. With eBookStudio's section-by-section generator and built-in editor, I finished, typeset, and launched in one weekend.",
    chart: [25, 40, 55, 75, 105, 128, 142],
  },
  {
    name: "Elena Rostova",
    role: "Etsy Digital Shop Owner",
    avatar: "ER",
    income: "$1,850 / month",
    growth: "+160%",
    platform: "Etsy Printables",
    quote:
      "The dedicated coloring book studio is incredible. Being able to regenerate individual pages while keeping the artistic style uniform saves me dozens of hours of Midjourney prompt wrestling.",
    chart: [20, 35, 50, 70, 95, 140, 185],
  },
  {
    name: "David Kim",
    role: "Technical Educator",
    avatar: "DK",
    income: "8 Books Published",
    growth: "+240%",
    platform: "Apple Books & KDP",
    quote:
      "The automatic spine calculation and bleed checks alone are worth the subscription. No more guessing millimetres in InDesign or fighting with Adobe Acrobat preflight errors.",
    chart: [20, 40, 60, 85, 110, 135, 165],
  },
  {
    name: "Chloe Laurent",
    role: "Children's Content Creator",
    avatar: "CL",
    income: "Top 1% Rated Seller",
    growth: "+310%",
    platform: "Amazon Paperback",
    quote:
      "The toddler thick-lines preset in the coloring studio produces the cleanest outlines I have ever seen from AI. Parents love the thick borders for early crayon skills.",
    chart: [35, 55, 75, 95, 120, 145, 170],
  },
  {
    name: "James Patel",
    role: "Fitness & Nutrition Coach",
    avatar: "JP",
    income: "$3,100 Launch Month",
    growth: "+195%",
    platform: "Direct Shopify Sales",
    quote:
      "Exported both the PDF and reflowable EPUB for my meal prep book. Customers read it seamlessly on iPhones, Kindles, and iPads without broken layouts or tables.",
    chart: [25, 45, 65, 90, 115, 150, 180],
  },
];

export function LandingTestimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Responsive visible count tracking
  useEffect(() => {
    function updateVisible() {
      if (typeof window === "undefined") return;
      if (window.innerWidth < 640) {
        setVisibleCount(1);
      } else if (window.innerWidth < 1024) {
        setVisibleCount(2);
      } else {
        setVisibleCount(3);
      }
    }
    updateVisible();
    window.addEventListener("resize", updateVisible);
    return () => window.removeEventListener("resize", updateVisible);
  }, []);

  const maxIndex = Math.max(0, TESTIMONIALS.length - visibleCount);

  // Keep index within bounds if window size changes
  useEffect(() => {
    if (currentIndex > maxIndex) {
      setCurrentIndex(maxIndex);
    }
  }, [currentIndex, maxIndex]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
  }, [maxIndex]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
  }, [maxIndex]);

  // Autoplay timer
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused, maxIndex]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (diff > 45) {
      handleNext();
    } else if (diff < -45) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  return (
    <section id="stories" className="py-24 bg-background relative overflow-hidden" aria-label="Creator Success Stories">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header with Slide Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary transition-transform hover:scale-105">
              <Sparkles className="h-3 w-3" />
              CREATOR SUCCESS
            </div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Real creators. Real income.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
              See how self-publishers, indie authors, and digital creators turn their concepts into monthly royalty income.
            </p>
          </div>

          {/* Navigation Slide Buttons */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous story"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-foreground shadow-xs transition-all duration-200 hover:bg-[#e8603c] hover:text-white hover:border-[#e8603c] hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next story"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-foreground shadow-xs transition-all duration-200 hover:bg-[#e8603c] hover:text-white hover:border-[#e8603c] hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Testimonials Slider Carousel */}
        <div
          className="mt-14 overflow-hidden relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex transition-transform duration-500 ease-out will-change-transform"
            style={{
              transform: `translateX(-${currentIndex * (100 / visibleCount)}%)`,
            }}
          >
            {TESTIMONIALS.map((t, idx) => (
              <div
                key={idx}
                className={cn(
                  "shrink-0 p-2 sm:p-3 flex",
                  visibleCount === 1 ? "w-full min-w-full" : visibleCount === 2 ? "w-1/2 min-w-[50%]" : "w-1/3 min-w-[33.333333%]"
                )}
              >
                <div className="group w-full rounded-3xl border border-border bg-surface p-6 sm:p-7 shadow-card flex flex-col justify-between transition-all duration-300 hover:border-[#e8603c]/40 hover:shadow-xl hover:-translate-y-1">
                  <div>
                    {/* Header with Avatar and Platform Tag */}
                    <div className="flex items-center justify-between pb-4 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8603c]/15 text-[#e8603c] font-black text-sm shadow-xs transition-transform duration-300 group-hover:scale-105">
                          {t.avatar}
                        </span>
                        <div>
                          <h4 className="font-bold text-foreground text-sm group-hover:text-[#a9462c] transition-colors">
                            {t.name}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">{t.role}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-muted/80 px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors group-hover:bg-[#e8603c]/10 group-hover:text-[#a9462c]">
                        {t.platform}
                      </span>
                    </div>

                    {/* High-Contrast Income Stat Card (Fixed Color Issue) */}
                    <div className="my-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-surface to-emerald-500/5 p-4 transition-all duration-300 group-hover:border-emerald-500/40 group-hover:shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Verified Result
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span>{t.growth}</span>
                        </div>
                      </div>

                      {/* Large High-Contrast Income Amount */}
                      <div className="mt-2 text-2xl font-black tracking-tight text-foreground">
                        {t.income}
                      </div>

                      {/* Vibrant Trend Bars */}
                      <div className="mt-3.5 flex items-end gap-1.5 h-8">
                        {t.chart.map((val, barIdx) => (
                          <div
                            key={barIdx}
                            className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 hover:from-emerald-700 hover:to-emerald-500 rounded-xs transition-all duration-300 shadow-xs"
                            style={{ height: `${(val / 185) * 100}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 5-Star Rating */}
                    <div className="flex items-center gap-1 text-amber-500 mb-2">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>

                    {/* Quote Text */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>

                  {/* Card Verified Footer */}
                  <div className="mt-5 pt-3.5 border-t border-border flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Verified eBookStudio Publisher</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Carousel Indicator Dots */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={cn(
                "h-2.5 rounded-full transition-all duration-300 cursor-pointer",
                currentIndex === idx
                  ? "w-8 bg-[#e8603c]"
                  : "w-2.5 bg-border hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
