"use client";

import { useState } from "react";
import { Star, Sparkles, ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  initials?: string;
  avatarUrl?: string;
  quote: string;
  pill: string;
  hasChart?: boolean;
}

const COLUMN_1: TestimonialItem[] = [
  {
    id: "david-r",
    name: "David R.",
    role: "Newsletter writer",
    initials: "DR",
    quote:
      "I always meant to write an ebook and never did. With eBookStudio I shipped five in a month and they sell while I sleep.",
    pill: "5 guides published",
  },
  {
    id: "sofia-k",
    name: "Sofia K.",
    role: "Marketing consultant",
    initials: "SK",
    quote:
      "I made a free lead magnet in an afternoon. It looks like something I paid a designer for, and it doubled my signups.",
    pill: "Grew my email list",
  },
  {
    id: "ben-h",
    name: "Ben H.",
    role: "Side-hustle creator",
    avatarUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&h=120&q=80",
    initials: "BH",
    quote:
      "I turned a topic I already knew well into a short guide over a weekend. It was live on KDP by Monday morning.",
    pill: "KDP best-seller",
  },
  {
    id: "sarah-j",
    name: "Sarah Jenkins",
    role: "KDP Low-Content Publisher",
    initials: "SJ",
    quote:
      "I published 4 animal coloring books with eBookStudio. The line art came out razor-sharp with pure white backgrounds — zero print quality rejections.",
    pill: "$4,280 in 60 days",
  },
];

const COLUMN_2: TestimonialItem[] = [
  {
    id: "elena-r",
    name: "Elena Rostova",
    role: "Solopreneur & author",
    initials: "ER",
    quote:
      "This is the first thing I have made that keeps earning after I stop working on it. The math finally works in my favor.",
    pill: "First passive income",
  },
  {
    id: "marco-d",
    name: "Marco D.",
    role: "Etsy shop owner",
    avatarUrl:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80",
    initials: "MD",
    quote:
      "I added a few digital ebooks to my Etsy shop with zero inventory and zero design work. Traffic and orders climbed without any extra work from me.",
    pill: "80% more shop visits",
    hasChart: true,
  },
  {
    id: "priya-j",
    name: "Priya J.",
    role: "Yoga instructor & author",
    initials: "PJ",
    quote:
      "Exported both the PDF and reflowable EPUB for my meal prep book. Customers read it seamlessly on iPhones, Kindles, and iPads without broken layouts.",
    pill: "$3,100 launch month",
  },
  {
    id: "marcus-v",
    name: "Marcus Vance",
    role: "Digital Entrepreneur & Writer",
    initials: "MV",
    quote:
      "Drafting a 15,000-word SaaS playbook used to take me two months. With the built-in generator and editor, I finished, typeset, and launched in one weekend.",
    pill: "1,420+ copies sold",
  },
];

const COLUMN_3: TestimonialItem[] = [
  {
    id: "chloe-l",
    name: "Chloe Laurent",
    role: "Children's Content Creator",
    initials: "CL",
    quote:
      "I treat each ebook like a tiny product launch. A small catalog now brings in real money every single month.",
    pill: "$2,400 last quarter",
  },
  {
    id: "aisha-o",
    name: "Aisha O.",
    role: "Creator",
    initials: "AO",
    quote:
      "No writing experience, no design skills, and I still ended up with something I am proud to put my name on.",
    pill: "Replaced my side gig",
  },
  {
    id: "maya-t",
    name: "Maya T.",
    role: "Coach",
    avatarUrl:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&h=120&q=80",
    initials: "MT",
    quote:
      "I stopped overthinking and just kept publishing. My catalog now earns money every month while I focus on coaching.",
    pill: "12 titles launched",
  },
  {
    id: "david-k",
    name: "David Kim",
    role: "Technical Educator",
    initials: "DK",
    quote:
      "The automatic spine calculation and bleed checks alone are worth the subscription. No more guessing millimetres in InDesign or fighting with Acrobat preflight errors.",
    pill: "8 books published",
  },
];

function TestimonialCard({ item }: { item: TestimonialItem }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group rounded-3xl border border-border/80 bg-surface p-6 sm:p-7 shadow-xs hover:shadow-md transition-all duration-300 hover:border-[#e8603c]/30 flex flex-col justify-between">
      <div>
        {/* Header: Avatar + Name + Subtitle */}
        <div className="flex items-center gap-3">
          {item.avatarUrl && !imgError ? (
            <img
              src={item.avatarUrl}
              alt={item.name}
              onError={() => setImgError(true)}
              className="h-10 w-10 rounded-full object-cover shrink-0 ring-1 ring-border"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fdebe5] text-[#e8603c] font-bold text-xs shrink-0">
              {item.initials ?? item.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h4 className="font-bold text-foreground text-sm leading-tight">{item.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{item.role}</p>
          </div>
        </div>

        {/* Coral / Salmon 5-Star Rating */}
        <div className="flex items-center gap-1 my-3 text-[#ff5c35]">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-[#ff5c35]" />
          ))}
        </div>

        {/* Quote text */}
        <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
          &ldquo;{item.quote}&rdquo;
        </p>
      </div>

      {/* Bottom Section: Result Pill Badge + Optional Analytics Graph */}
      <div className="mt-4 pt-1">
        <span className="inline-flex items-center rounded-full bg-[#edf7f2] dark:bg-emerald-950/40 text-[#1f6b43] dark:text-emerald-300 px-3 py-1 text-xs font-semibold border border-[#d2edd9]/60">
          {item.pill}
        </span>

        {/* Minimal Analytics Graph (matches user's screenshot) */}
        {item.hasChart && (
          <div className="mt-3.5 rounded-2xl border border-border/70 bg-muted/20 p-3.5 transition-all">
            <div className="grid grid-cols-4 gap-2 text-center pb-2.5 border-b border-border/60">
              <div>
                <span className="block text-[10px] text-muted-foreground">Visits</span>
                <span className="text-xs font-black text-foreground">527</span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Orders</span>
                <span className="text-xs font-black text-foreground">13</span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Conv. rate</span>
                <span className="text-xs font-black text-foreground">2.5%</span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Revenue</span>
                <span className="text-xs font-black text-foreground">$76.37</span>
              </div>
            </div>

            {/* Line Trend with Marker Dots */}
            <div className="mt-3 h-12 w-full">
              <svg viewBox="0 0 240 50" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="#3f3935"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="10,40 30,38 50,30 70,36 90,20 110,29 130,17 150,25 170,12 190,23 210,15 230,20"
                />
                {[
                  [10, 40],
                  [30, 38],
                  [50, 30],
                  [70, 36],
                  [90, 20],
                  [110, 29],
                  [130, 17],
                  [150, 25],
                  [170, 12],
                  [190, 23],
                  [210, 15],
                  [230, 20],
                ].map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="2.2" fill="#3f3935" />
                ))}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LandingTestimonials() {
  const [direction, setDirection] = useState<"down" | "up">("down");
  const [isPaused, setIsPaused] = useState(false);

  const col1Animation = direction === "down" ? "animate-marquee-down-normal" : "animate-marquee-up-normal";
  const col2Animation = direction === "down" ? "animate-marquee-down-slow" : "animate-marquee-up-slow";
  const col3Animation = direction === "down" ? "animate-marquee-down-fast" : "animate-marquee-up-fast";

  return (
    <section id="stories" className="py-24 bg-background relative overflow-hidden" aria-label="Creator Success Stories">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
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

          {/* Direction & Pause Controls */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setDirection("down")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  direction === "down"
                    ? "bg-[#e8603c] text-white shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span>Top to bottom</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("up")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  direction === "up"
                    ? "bg-[#e8603c] text-white shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                <span>Bottom to top</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground shadow-xs transition-all cursor-pointer"
            >
              {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-600" /> : <Pause className="h-3.5 w-3.5" />}
              <span>{isPaused ? "Resume scroll" : "Pause scroll"}</span>
            </button>
          </div>
        </div>

        {/* Infinite Moving Marquee Columns with Top & Bottom Fade Overlays */}
        <div className="relative mt-14 max-h-[660px] overflow-hidden marquee-pause">
          {/* Top Gradient Fade Mask */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background via-background/85 to-transparent z-20" />

          {/* 3 Continuous Moving Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {/* Column 1: Top-to-Bottom Marquee */}
            <div
              className={cn("flex flex-col gap-6 will-change-transform", col1Animation)}
              style={isPaused ? { animationPlayState: "paused" } : undefined}
            >
              {[...COLUMN_1, ...COLUMN_1].map((item, idx) => (
                <TestimonialCard key={`col1-${idx}`} item={item} />
              ))}
            </div>

            {/* Column 2: Top-to-Bottom Marquee (Graceful Pace) */}
            <div
              className={cn("hidden md:flex flex-col gap-6 will-change-transform", col2Animation)}
              style={isPaused ? { animationPlayState: "paused" } : undefined}
            >
              {[...COLUMN_2, ...COLUMN_2].map((item, idx) => (
                <TestimonialCard key={`col2-${idx}`} item={item} />
              ))}
            </div>

            {/* Column 3: Top-to-Bottom Marquee */}
            <div
              className={cn("hidden lg:flex flex-col gap-6 will-change-transform", col3Animation)}
              style={isPaused ? { animationPlayState: "paused" } : undefined}
            >
              {[...COLUMN_3, ...COLUMN_3].map((item, idx) => (
                <TestimonialCard key={`col3-${idx}`} item={item} />
              ))}
            </div>
          </div>

          {/* Bottom Gradient Fade Mask */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/85 to-transparent z-20" />
        </div>
      </div>
    </section>
  );
}
