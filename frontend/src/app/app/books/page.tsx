"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FilterX, Search } from "lucide-react";
import { BOOK_TYPES, BOOK_TYPE_LABELS, BOOK_STATUSES, LANGUAGES } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { BookCard, STATUS_META } from "@/components/books/book-card";
import { BookOrganization, useProjects } from "@/components/books/library-tools";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useIsSignedIn } from "@/lib/queries";
import type { BookSummary } from "@/lib/types";

/**
 * The library.
 *
 * Every filter lives in the URL, so a filtered view can be shared or reloaded
 * without losing its state. The filter row is a panel rather than a bare row of
 * selects, because there are six of them and a bare row does not say what they
 * are.
 */
function Library() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const signedIn = useIsSignedIn();
  const projects = useProjects("archived=all&limit=100");
  const books = useQuery({
    queryKey: ["books", "library", query],
    queryFn: () => api.get<{ books: BookSummary[]; nextCursor: string | null }>(`/books?${query}`),
    enabled: signedIn,
  });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    // A filter change invalidates the page cursor, so it is dropped.
    if (key !== "cursor") next.delete("cursor");
    router.replace(`/app/books?${next.toString()}`, { scroll: false });
  };

  const filter = (key: string, label: string, options: { value: string; label: string }[]) => (
    <Field label={label} htmlFor={`filter-${key}`}>
      <Select id={`filter-${key}`} value={params.get(key) ?? ""} onChange={(e) => set(key, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  const activeFilters = ["archived", "projectId", "language", "bookType", "status", "sort"].filter((key) =>
    params.get(key) ? true : false,
  );
  const hasFilters = activeFilters.length > 0 || Boolean(params.get("search"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8" suppressHydrationWarning>
      <PageHeader
        title="My eBooks"
        description="Organize your books and find archived work."
        actions={
          <div className="flex gap-2">
            <Link href="/app/projects" className={buttonVariants({ variant: "secondary" })}>
              Projects
            </Link>
            <Link href="/app/create" className={buttonVariants()}>
              New eBook
            </Link>
          </div>
        }
      />

      <form
        className="mb-4 flex gap-2"
        key={params.get("search") ?? ""}
        onSubmit={(e) => {
          e.preventDefault();
          set("search", String(new FormData(e.currentTarget).get("search") ?? "").trim());
        }}
      >
        <Input name="search" aria-label="Search books" placeholder="Search by title" defaultValue={params.get("search") ?? ""} maxLength={200} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Filters</h2>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => router.replace("/app/books")}>
              <FilterX className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filter("archived", "Archive filter", [
            { value: "", label: "Active books" },
            { value: "archived", label: "Archived books" },
            { value: "all", label: "All books" },
          ])}
          {filter("projectId", "Project filter", [
            { value: "", label: "All projects" },
            { value: "_none", label: "No project" },
            ...(projects.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []),
          ])}
          {filter("language", "Language filter", [
            { value: "", label: "All languages" },
            ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
          ])}
          {filter("bookType", "Book type filter", [
            { value: "", label: "All types" },
            ...BOOK_TYPES.map((t) => ({ value: t, label: BOOK_TYPE_LABELS[t] })),
          ])}
          {filter("status", "Status filter", [
            { value: "", label: "All statuses" },
            ...BOOK_STATUSES.map((t) => ({ value: t, label: STATUS_META[t].label })),
          ])}
          {filter("sort", "Sort books", [
            { value: "", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "title", label: "Title A–Z" },
          ])}
        </div>
      </Card>

      {books.isPending && !books.error ? (
        <PageLoader />
      ) : books.error ? (
        <ErrorState
          message={errorMessage(books.error)}
          onRetry={() => (params.get("cursor") ? set("cursor", "") : void books.refetch())}
        />
      ) : books.data && books.data.books.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {books.data.books.map((b) => (
              <div key={b.id}>
                <BookCard book={b} />
                <BookOrganization book={b} />
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={!params.get("cursor")} onClick={() => set("cursor", "")}>
              First page
            </Button>
            <Button variant="secondary" disabled={!books.data.nextCursor} onClick={() => set("cursor", books.data!.nextCursor!)}>
              Next books
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={hasFilters ? "No books match these filters" : "Your library is empty"}
          description={
            hasFilters
              ? "Try widening the filters, or clear them to see every book you have."
              : "Describe an idea in one sentence and eBookStudio will plan the chapters for you."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={() => router.replace("/app/books")}>
                <FilterX className="h-4 w-4" />
                Clear filters
              </Button>
            ) : (
              <Link href="/app/create" className={buttonVariants()}>
                Create your first eBook
              </Link>
            )
          }
        />
      )}
    </div>
  );
}

export default function BooksPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Library />
    </Suspense>
  );
}
