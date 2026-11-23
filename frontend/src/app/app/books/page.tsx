"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { EbookCard } from "@/components/books/ebook-card";
import { EbookGrid } from "@/components/books/ebook-grid";
import { EbookListView } from "@/components/books/ebook-list-view";
import { EbookGridSkeleton } from "@/components/books/ebook-card-skeleton";
import { EbookSearch } from "@/components/books/ebook-search";
import { EbookFilters } from "@/components/books/ebook-filters";
import { EbookSort } from "@/components/books/ebook-sort";
import { EbookEmptyState } from "@/components/books/ebook-empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, PageLoader } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useIsSignedIn } from "@/lib/queries";
import type { BookSummary } from "@/lib/types";

function MyEbooksLibrary() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const signedIn = useIsSignedIn();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const booksQuery = useQuery({
    queryKey: ["books", "library", query],
    queryFn: () => api.get<{ books: BookSummary[]; nextCursor: string | null }>(`/books?${query}`),
    enabled: signedIn,
  });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "cursor") next.delete("cursor");
    router.replace(`/app/books?${next.toString()}`, { scroll: false });
  };

  const handleFilterSelect = ({ status, archived }: { status?: string; archived?: string }) => {
    const next = new URLSearchParams(query);
    if (status) next.set("status", status);
    else next.delete("status");

    if (archived && archived !== "active") next.set("archived", archived);
    else next.delete("archived");

    next.delete("cursor");
    router.replace(`/app/books?${next.toString()}`, { scroll: false });
  };

  const currentSearch = params.get("search") ?? "";
  const currentStatus = params.get("status") ?? "";
  const currentArchived = params.get("archived") ?? "active";
  const currentSort = params.get("sort") ?? "updated";

  const hasFilters = Boolean(currentSearch || currentStatus || currentArchived === "archived");

  const booksList = booksQuery.data?.books ?? [];
  const bookCount = booksList.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      {/* Page Header */}
      <PageHeader
        title="My Ebooks"
        description={`Manage, edit, and organize your ebooks${booksQuery.data ? ` (${bookCount} ${bookCount === 1 ? "book" : "books"})` : ""}.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/app/create" className={buttonVariants({ className: "gap-1.5 font-semibold shadow-sm" })}>
              <Plus className="h-4 w-4" />
              Create New Ebook
            </Link>
          </div>
        }
      />

      {/* Control Bar: Search, Filter Tabs, Sort, and View Toggle */}
      <div className="mb-8 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <EbookSearch
            value={currentSearch}
            onChange={(val) => setParam("search", val || undefined)}
          />

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <EbookSort
              value={currentSort}
              onChange={(sortVal) => setParam("sort", sortVal)}
            />

            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-border bg-surface p-0.5 shadow-none">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <EbookFilters
          currentStatus={currentStatus}
          isArchived={currentArchived}
          onSelect={handleFilterSelect}
        />
      </div>

      {/* Content Section */}
      {booksQuery.isPending && !booksQuery.error ? (
        <EbookGridSkeleton count={8} />
      ) : booksQuery.error ? (
        <ErrorState
          message={errorMessage(booksQuery.error)}
          onRetry={() => (params.get("cursor") ? setParam("cursor", "") : void booksQuery.refetch())}
        />
      ) : booksList.length > 0 ? (
        <>
          {viewMode === "grid" ? (
            <EbookGrid>
              {booksList.map((book) => (
                <EbookCard key={book.id} book={book} />
              ))}
            </EbookGrid>
          ) : (
            <EbookListView books={booksList} />
          )}

          {/* Pagination */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={!params.get("cursor")}
              onClick={() => setParam("cursor", "")}
            >
              First page
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!booksQuery.data?.nextCursor}
              onClick={() => setParam("cursor", booksQuery.data!.nextCursor!)}
            >
              Next page →
            </Button>
          </div>
        </>
      ) : (
        <EbookEmptyState
          hasFilters={hasFilters}
          onClearFilters={() => router.replace("/app/books")}
        />
      )}
    </div>
  );
}

export default function BooksPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MyEbooksLibrary />
    </Suspense>
  );
}
