"use client";

import Link from "next/link";
import {
  Calendar,
  Download,
  Eye,
  Layers,
  Palette,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageLoader } from "@/components/ui/misc";
import { useColoringBooks } from "@/lib/coloring-queries";

export default function ColoringStudioDashboardPage() {
  const { data, isLoading } = useColoringBooks();

  if (isLoading) {
    return <PageLoader label="Loading your coloring studio…" />;
  }

  const books = data?.books ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      {/* Hero Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Palette className="h-3.5 w-3.5" /> AI Coloring Book Studio
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Coloring Books</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Generate printable line-art coloring books, customize individual pages independently, and compile
            Amazon KDP print-ready PDFs.
          </p>
        </div>
        <Link href="/app/coloring-book/create">
          <Button size="lg" className="gap-2 shadow-md">
            <PlusCircle className="h-5 w-5" /> Create Coloring Book
          </Button>
        </Link>
      </div>

      {/* Book Grid or Empty State */}
      {books.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={<Palette className="h-8 w-8" />}
            title="No coloring books yet"
            description="Turn an idea into a 24 to 60-page printable coloring book with clean line-art outlines in minutes. Planning is completely free."
            action={
              <Link href="/app/coloring-book/create">
                <Button className="gap-2">
                  <Sparkles className="h-4 w-4" /> Start Your First Coloring Book
                </Button>
              </Link>
            }
          />
          {/* Quick Idea Starter Cards */}
          <div className="mt-12">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Popular Coloring Book Ideas
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  title: "Cute Farm Animals",
                  style: "Kawaii Chibi",
                  desc: "Baby cows, piglets, bunnies, and sheep having gentle farm adventures.",
                },
                {
                  title: "Botanical Floral Mandalas",
                  style: "Mandala & Patterns",
                  desc: "Intricate blooming flowers, vines, and symmetrical relaxing patterns for adults.",
                },
                {
                  title: "Prehistoric Dinosaur Fun",
                  style: "Bold & Easy",
                  desc: "Large thick-outline T-Rex and friendly triceratops for toddlers and kids.",
                },
              ].map((idea) => (
                <Card key={idea.title} className="p-5 transition-shadow hover:shadow-md">
                  <Badge tone="primary" className="text-[10px]">
                    {idea.style}
                  </Badge>
                  <h4 className="mt-2 font-bold">{idea.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{idea.desc}</p>
                  <Link
                    href={`/app/coloring-book/create?topic=${encodeURIComponent(idea.title)}`}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Use this idea →
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => {
            const plan = book.coloringPlan;
            const pageCount = plan?.pageCount || book._count?.coloringPages || 24;
            const updatedDate = new Date(book.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <Card
                key={book.id}
                className="group flex flex-col justify-between overflow-hidden p-6 transition-all hover:border-primary/50 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface border border-border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                      <Sparkles className="h-3 w-3" />
                      {plan?.artStyle ? plan.artStyle.replace(/_/g, " ") : "Coloring Book"}
                    </span>
                    <Badge tone="neutral">{plan?.trimSize || "8.5x11"}</Badge>
                  </div>

                  <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                    {book.title}
                  </h3>
                  {book.subtitle && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{book.subtitle}</p>
                  )}

                  <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> {pageCount} pages
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {updatedDate}
                    </span>
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <Link href={`/app/coloring-book/${book.id}/pages`} className="flex-1">
                      <Button variant="primary" size="sm" className="w-full gap-1.5">
                        <Palette className="h-3.5 w-3.5" /> Open Studio
                      </Button>
                    </Link>
                    <Link href={`/app/coloring-book/${book.id}/preview`}>
                      <Button variant="secondary" size="sm" className="px-2.5" title="Preview Spreads">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Link href={`/app/coloring-book/${book.id}/export`}>
                      <Button variant="secondary" size="sm" className="px-2.5" title="Export KDP PDF">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
