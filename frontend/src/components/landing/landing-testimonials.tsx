import { Star, TrendingUp, CheckCircle2, Sparkles } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "Sarah Jenkins",
    role: "KDP Low-Content Publisher",
    avatar: "SJ",
    income: "$4,280 in 60 Days",
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
    platform: "Gumroad & Twitter",
    quote:
      "Drafting a 15,000-word SaaS playbook used to take me two months. With eBookStudio's section-by-section generator and built-in editor, I finished, typeset, and launched in one weekend.",
    chart: [20, 35, 50, 75, 110, 130, 142],
  },
  {
    name: "Elena Rostova",
    role: "Etsy Digital Shop Owner",
    avatar: "ER",
    income: "$1,850 / month",
    platform: "Etsy Printables",
    quote:
      "The dedicated coloring book studio is incredible. Being able to regenerate individual pages while keeping the artistic style uniform saves me dozens of hours of Midjourney prompt wrestling.",
    chart: [15, 30, 45, 60, 90, 140, 185],
  },
  {
    name: "David Kim",
    role: "Technical Educator",
    avatar: "DK",
    income: "8 Books Published",
    platform: "Apple Books & KDP",
    quote:
      "The automatic spine calculation and bleed checks alone are worth the subscription. No more guessing millimetres in InDesign or fighting with Adobe Acrobat preflight errors.",
    chart: null,
  },
  {
    name: "Chloe Laurent",
    role: "Children's Content Creator",
    avatar: "CL",
    income: "Top 1% Rated Seller",
    platform: "Amazon Paperback",
    quote:
      "The toddler thick-lines preset in the coloring studio produces the cleanest outlines I have ever seen from AI. Parents love the thick borders for early crayon skills.",
    chart: null,
  },
  {
    name: "James Patel",
    role: "Fitness & Nutrition Coach",
    avatar: "JP",
    income: "$3,100 Launch Month",
    platform: "Direct Shopify Sales",
    quote:
      "Exported both the PDF and reflowable EPUB for my meal prep book. Customers read it seamlessly on iPhones, Kindles, and iPads without broken layouts or tables.",
    chart: null,
  },
];

export function LandingTestimonials() {
  return (
    <section id="stories" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            CREATOR SUCCESS
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
            Real creators. Real income.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            See how self-publishers, indie authors, and digital creators turn their concepts into monthly royalty income.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-border bg-surface p-6 sm:p-7 shadow-card flex flex-col justify-between transition-all hover:border-[#e8603c]/40 hover:shadow-md"
            >
              <div>
                {/* Header with Avatar and Platform Tag */}
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8603c]/15 text-[#e8603c] font-bold text-sm">
                      {t.avatar}
                    </span>
                    <div>
                      <h4 className="font-bold text-foreground text-sm">{t.name}</h4>
                      <p className="text-[11px] text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {t.platform}
                  </span>
                </div>

                {/* Income Stat Badge & Mini Chart */}
                <div className="my-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                      Verified Result
                    </span>
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-400">
                    {t.income}
                  </div>

                  {/* Visual trend bars if available */}
                  {t.chart && (
                    <div className="mt-3 flex items-end gap-1.5 h-8">
                      {t.chart.map((val, barIdx) => (
                        <div
                          key={barIdx}
                          className="flex-1 bg-emerald-500 rounded-xs"
                          style={{ height: `${(val / 150) * 100}%` }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Stars */}
                <div className="flex items-center gap-1 text-amber-500 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>

                {/* Quote Text */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  "{t.quote}"
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-border flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Verified eBookStudio Publisher
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
