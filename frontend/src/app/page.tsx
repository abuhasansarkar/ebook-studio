import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingShowcase } from "@/components/landing/landing-showcase";
import { LandingBento } from "@/components/landing/landing-bento";
import { LandingSteps } from "@/components/landing/landing-steps";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingDistribution } from "@/components/landing/landing-distribution";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingFAQ } from "@/components/landing/landing-faq";
import { LandingCTA } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "eBookStudio",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "An AI-assisted writing and coloring book studio that plans, writes, illustrates, typesets, reviews and packages eBooks, then prepares commercial files for Amazon KDP, Etsy and Gumroad.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free to start. 100 credits are included when you sign up.",
    },
    featureList: [
      "AI outline and chapter generation",
      "Dedicated AI Coloring Book Studio with 12 art styles",
      "Pure 300 DPI vector line art optimization with zero grayscale fuzz",
      "Rich-text editor with autosave and revision history",
      "Full-wrap cover generator with automated Amazon KDP spine calculation",
      "Automated print quality preflight audit (gutter margins, bleed, DPI)",
      "Validated PDF, EPUB 3, DOCX and Etsy image pack exports",
      "Distribution packages for Amazon KDP, Etsy, Gumroad and Shopify",
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-[#e8603c]/20 selection:text-[#a9462c]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <LandingShowcase />
        <LandingBento />
        <LandingSteps />
        <LandingTestimonials />
        <LandingDistribution />
        <LandingPricing />
        <LandingFAQ />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
