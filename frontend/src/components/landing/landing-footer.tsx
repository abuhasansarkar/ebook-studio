"use client";

import Link from "next/link";
import { Logo } from "@/components/app/logo";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "eBook Studio", href: "#features" },
      { label: "AI Coloring Studio", href: "#features" },
      { label: "Full-Wrap Cover Creator", href: "#features" },
      { label: "KDP Preflight Audit", href: "#features" },
      { label: "Pricing & Plans", href: "#pricing" },
    ],
  },
  {
    title: "Popular Niches",
    links: [
      { label: "Cookbooks & Meal Prep", href: "#showcase" },
      { label: "Kids Animal Coloring Books", href: "#showcase" },
      { label: "Fantasy Mandalas", href: "#showcase" },
      { label: "SaaS & Business Playbooks", href: "#showcase" },
      { label: "Mindfulness Journals", href: "#showcase" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "KDP Spine Calculator", href: "#features" },
      { label: "Print Bleed Guide", href: "#features" },
      { label: "Creator Income Stories", href: "#stories" },
      { label: "Commercial Rights License", href: "#faq" },
      { label: "Frequently Asked Questions", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/" },
      { label: "Sign In", href: "/login" },
      { label: "Create Free Account", href: "/signup" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

const CURRENT_YEAR = 2026;

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand Column */}
          <div className="col-span-2">
            <Logo href="/" />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground leading-relaxed">
              The premier AI writing and coloring book creation studio. Plan, write, illustrate,
              format, and package commercial books ready for Amazon KDP, Etsy, and Gumroad.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                All systems operational • 300 DPI Generation Active
              </span>
            </div>
          </div>

          {/* Links Columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {CURRENT_YEAR} eBookStudio. All rights reserved. Built for digital authors & creators.</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              Back to top ↑
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
