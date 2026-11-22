"use client";

import { useEffect, useState } from "react";
import { Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import { useOpsBooks } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/**
 * Every book on the platform.
 *
 * The list is deliberately read-only: an operator can see what a customer
 * has written, but the manuscript itself is the customer's, and the API
 * offers no way for an operator to edit it.
 */
export function BooksPanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // The server is asked once typing pauses, so every book is searchable, not just the newest page.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const books = useOpsBooks(true, query || undefined);

  if (books.isLoading) return <PageLoader />;
  if (books.error) return <ErrorState message={errorMessage(books.error)} onRetry={() => void books.refetch()} />;

  const visible = books.data ?? [];

  return (
    <div className="space-y-4">
      <Input
        className="w-full max-w-sm bg-background"
        placeholder="Search by title or owner"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search books"
        data-testid="admin-book-search"
      />
      <Card className="divide-y divide-border">
        {visible.map((book) => (
          <div key={book.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{book.title}</p>
              <p className="truncate text-xs text-muted-foreground">{book.ownerEmail}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {book.chapterCount} chapter{book.chapterCount === 1 ? "" : "s"} · {book.exportCount} export
                {book.exportCount === 1 ? "" : "s"} · {timeAgo(book.createdAt)}
              </p>
            </div>
            <Badge tone={book.status === "failed" ? "danger" : "neutral"}>{book.status.replace(/_/g, " ")}</Badge>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {query ? "No books match that search." : "No books yet."}
          </p>
        )}
      </Card>
    </div>
  );
}
