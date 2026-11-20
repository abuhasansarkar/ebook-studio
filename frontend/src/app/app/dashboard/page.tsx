"use client";

import Link from "next/link";
import { BookOpen, Coins, FileText, PenLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { BookCard } from "@/components/books/book-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { useDashboard } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useDashboard();
  const firstName = session?.user.name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Pick up where you left off, or start something new."
        actions={
          <Link href="/app/create" className={buttonVariants()}>
            <Plus className="h-4 w-4" /> New eBook
          </Link>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "eBooks", value: data.totals.books, icon: BookOpen },
              { label: "Chapters written", value: data.totals.chapters, icon: FileText },
              { label: "Words written", value: data.totals.words, icon: PenLine },
              { label: "Credits available", value: data.credits.balance, icon: Coins },
            ].map((s) => (
              <Card key={s.label} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <s.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight">{formatNumber(s.value)}</p>
              </Card>
            ))}
          </div>

          <div className="mb-4 mt-10 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent eBooks</h2>
            {data.recentBooks.length > 0 && (
              <Link href="/app/books" className="text-sm font-semibold text-primary-hover hover:underline">
                View all
              </Link>
            )}
          </div>
          {data.recentBooks.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title="Your library is empty"
              description="Describe an idea in one sentence and eBookStudio will plan the chapters for you."
              action={
                <Link href="/app/create" className={buttonVariants()}>
                  <Plus className="h-4 w-4" /> Create your first eBook
                </Link>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.recentBooks.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
