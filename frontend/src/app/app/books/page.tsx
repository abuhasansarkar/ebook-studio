"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { BookCard } from "@/components/books/book-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBooks } from "@/lib/queries";

export default function BooksPage() {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, error, refetch } = useBooks(deferred || undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="My eBooks"
        description="Every book you've started, in one place."
        actions={
          <Link href="/app/create" className={buttonVariants()}>
            <Plus className="h-4 w-4" /> New eBook
          </Link>
        }
      />
      <div className="relative mb-6 max-w-sm">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" aria-label="Search books" />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        deferred ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="No matches" description={`No books with "${deferred}" in the title.`} />
        ) : (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No eBooks yet"
            description="Create your first book — it only takes a sentence to start."
            action={
              <Link href="/app/create" className={buttonVariants()}>
                <Plus className="h-4 w-4" /> Create eBook
              </Link>
            }
          />
        )
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
    </div>
  );
}
