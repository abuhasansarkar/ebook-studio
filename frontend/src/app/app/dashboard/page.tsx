"use client";

import Link from "next/link";
import { BookOpen, Coins, FileText, PenLine, Plus, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { EbookCard } from "@/components/books/ebook-card";
import { EbookGrid } from "@/components/books/ebook-grid";
import { EbookGridSkeleton } from "@/components/books/ebook-card-skeleton";
import { EbookEmptyState } from "@/components/books/ebook-empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { useDashboard } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isPending, error, refetch } = useDashboard();
  const firstName = session?.user.name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Pick up where you left off, or start something new."
        actions={
          <Link href="/app/create" className={buttonVariants({ className: "gap-1.5 font-semibold shadow-sm" })}>
            <Plus className="h-4 w-4" /> New eBook
          </Link>
        }
      />

      {isPending ? (
        <div className="space-y-10">
          <PageLoader />
          <EbookGridSkeleton count={4} />
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          {/* Quick Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "eBooks", value: data.totals.books, icon: BookOpen },
              { label: "Chapters written", value: data.totals.chapters, icon: FileText },
              { label: "Words written", value: data.totals.words, icon: PenLine },
              { label: "Credits available", value: data.credits.balance, icon: Coins },
            ].map((s) => (
              <Card key={s.label} className="p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                  <s.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                  {formatNumber(s.value)}
                </p>
              </Card>
            ))}
          </div>

          {/* Recent eBooks Section */}
          <div className="mb-5 mt-12 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Recent eBooks</h2>
              <p className="text-xs text-muted-foreground">Pick up editing on your recently modified titles.</p>
            </div>
            {data.recentBooks.length > 0 && (
              <Link
                href="/app/books"
                className="group inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover transition-colors"
              >
                <span>View all eBooks</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>

          {data.recentBooks.length === 0 ? (
            <EbookEmptyState />
          ) : (
            <EbookGrid>
              {data.recentBooks.map((b) => (
                <EbookCard key={b.id} book={b} />
              ))}
            </EbookGrid>
          )}
        </>
      ) : null}
    </div>
  );
}
