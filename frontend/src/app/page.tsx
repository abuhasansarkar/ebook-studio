import Link from "next/link";
import { BookOpen, CheckCircle2, FileDown, Globe2, ListTree, PenLine, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { LANGUAGES } from "@ebook/shared";
import { Logo } from "@/components/app/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const steps = [
  { icon: Sparkles, title: "Describe your idea", text: "One sentence is enough. Add your audience, tone and language if you like — sensible defaults handle the rest." },
  { icon: ListTree, title: "Shape the outline", text: "Review the AI's chapter plan, rename, reorder or add chapters, then approve it before a single page is written." },
  { icon: PenLine, title: "Write, edit, export", text: "Chapters are written one section at a time with live progress. Polish them in the editor, then export a typeset PDF, EPUB or Word document — each one checked before you download it." },
];

const features = [
  { icon: ListTree, title: "Outline approval gate", text: "Nothing is written until you approve the structure — so the book says what you want it to say." },
  { icon: Wand2, title: "Section-by-section writing", text: "Each chapter knows what earlier chapters covered, which keeps the book consistent and avoids repetition." },
  { icon: PenLine, title: "A real book editor", text: "Rich text, tables, autosave and conflict protection, so you never lose work across tabs or devices." },
  { icon: Sparkles, title: "AI writing assistant", text: "Select text to rewrite, expand, shorten or proofread. You always see the suggestion before it replaces anything." },
  { icon: Globe2, title: "20 languages", text: "Write in English, Bengali, Hindi, Arabic, Chinese, Spanish and more — including right-to-left scripts." },
  { icon: FileDown, title: "Validated PDF export", text: "Typeset 6×9 in books with a title page, clickable contents and page numbers. Every file is checked before download." },
];

const qualityRules = [
  "No invented statistics, quotes or citations",
  "No filler paragraphs or recycled explanations",
  "Facts, opinions and examples kept clearly apart",
  "Credits only charged for chapters actually written",
];

/** Cached at prerender time (Cache Components disallows `new Date()` in the static shell). */
async function CopyrightYear() {
  "use cache";
  return <>{new Date().getFullYear()}</>;
}

export default function LandingPage() {
  // The structured data describes what the product actually is. It names the
  // real capabilities and does not claim a store approval or a factual
  // guarantee, because the product makes neither.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "eBookStudio",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "An AI-assisted writing studio that plans, writes, typesets, reviews and packages eBooks, then prepares the files for Amazon KDP, Etsy and Gumroad.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free to start. 100 credits are included when you sign up.",
    },
    featureList: [
      "AI outline and chapter generation",
      "Rich-text editor with autosave and revision history",
      "Interior design templates and multilingual typesetting",
      "Cover and illustration studio with editable typography",
      "Quality review with anchored findings",
      "Private source imports and source-grounded research",
      "Validated PDF, EPUB and Word exports",
      "Distribution packages for KDP, Etsy, Gumroad and direct sales",
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Main">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#languages" className="hover:text-foreground">Languages</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Log in</Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>Start free</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-hover">
            <Sparkles className="h-3.5 w-3.5" /> 100 free credits when you sign up
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            From your idea to a <span className="text-primary">publish-ready</span> eBook.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            eBookStudio plans, writes and typesets professional eBooks with AI — and gives you a real editor to make every page yours.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>Create your first eBook</Link>
            <a href="#how" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full sm:w-auto")}>See how it works</a>
          </div>

          {/* Product preview */}
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-border bg-surface p-3 shadow-card">
            <div className="grid gap-3 rounded-xl bg-muted/60 p-4 text-start sm:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                {["Introduction", "Planning your week", "Smart shopping", "Batch cooking basics", "Conclusion"].map((t, i) => (
                  <div key={t} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", i === 1 ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground")}>
                    <CheckCircle2 className={cn("h-4 w-4", i < 3 ? "text-success" : "text-border")} />
                    {t}
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-surface p-6 shadow-sm">
                <p className="text-xs font-semibold text-primary">CHAPTER 2</p>
                <p className="mt-1 text-xl font-bold">Planning your week</p>
                <div className="mt-4 space-y-2">
                  <div className="h-2.5 w-full rounded bg-muted" />
                  <div className="h-2.5 w-11/12 rounded bg-muted" />
                  <div className="h-2.5 w-4/5 rounded bg-muted" />
                  <div className="mt-4 h-2.5 w-full rounded bg-muted" />
                  <div className="h-2.5 w-3/4 rounded bg-muted" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">Three steps, and you stay in control at every one of them.</p>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">{i + 1}</span>
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Built for books worth selling</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 grid items-center gap-8 rounded-2xl border border-border bg-surface p-8 md:grid-cols-[1fr_1.2fr]">
              <div>
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h3 className="mt-3 text-2xl font-bold">Quality rules, built in</h3>
                <p className="mt-2 text-muted-foreground">A 100-page book of repetitive paragraphs isn&apos;t a product. Every chapter is written under rules designed to keep it useful.</p>
              </div>
              <ul className="grid gap-3">
                {qualityRules.map((r) => (
                  <li key={r} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Languages */}
        <section id="languages" className="border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <Globe2 className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Write in the language your readers speak</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Native fonts, correct shaping for complex scripts, and right-to-left layout where it&apos;s needed.</p>
            <ul className="mt-10 flex flex-wrap justify-center gap-2">
              {LANGUAGES.map((l) => (
                <li key={l.code} lang={l.code} dir={l.dir} className="rounded-full border border-border bg-background px-4 py-1.5 text-sm">
                  {l.nativeName}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="rounded-3xl bg-foreground px-8 py-14 text-center text-white">
              <BookOpen className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Your book is one sentence away.</h2>
              <p className="mx-auto mt-3 max-w-lg text-white/70">Start with free credits. No credit card needed.</p>
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>Start building, free</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p>© <CopyrightYear /> eBookStudio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
