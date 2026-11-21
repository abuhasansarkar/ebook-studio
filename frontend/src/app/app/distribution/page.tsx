"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Package, Send, ShieldCheck } from "lucide-react";
import {
  DISTRIBUTION_LABELS as DEST_LABELS,
  type DistributionDestination,
  type DistributionMetadata,
  type DistributionPackage,
  type PublishingState,
} from "@ebook/shared";

import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import { useExports } from "@/lib/queries";
import {
  useDestinations,
  useDistributionPackages,
  usePreparePackage,
  usePublishingStatus,
  useSetPublishingStatus,
} from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/**
 * S14 — distribution packages.
 *
 * The product assembles a ZIP the author uploads to a store themselves. The
 * screen is explicit about that boundary: it never says a store accepted a
 * book, because the product does not know that. The publishing status below is
 * the author's own record of what happened.
 */

const STATE_TONE: Record<PublishingState, "neutral" | "primary" | "warning" | "success"> = {
  not_prepared: "neutral",
  in_progress: "primary",
  submitted: "warning",
  published: "success",
};

const STATE_LABEL: Record<PublishingState, string> = {
  not_prepared: "Not prepared",
  in_progress: "In progress",
  submitted: "Submitted",
  published: "Published",
};

/** The kind of file the destination needs. */
function formatLabel(format: string) {
  return format === "pdf" ? "PDF" : format === "epub" ? "EPUB" : format === "docx" ? "Word" : format.toUpperCase();
}

/** One prepared package, with its checks. */
function PackageCard({ pkg }: { pkg: DistributionPackage }) {
  const blockers = pkg.checks.filter((check) => check.status === "blocker");
  const reviews = pkg.checks.filter((check) => check.status === "review");

  return (
    <Card className="p-5" data-testid={`package-${pkg.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{DEST_LABELS[pkg.destination]}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {pkg.status} · {formatNumber(Math.round(pkg.bytes / 1024))} KB · {timeAgo(pkg.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={pkg.status === "ready" ? "success" : pkg.status === "blocked" ? "danger" : "neutral"}>
            {pkg.status}
          </Badge>
          {pkg.status === "ready" && (
            <a href={`/api/v1/distribution/packages/${pkg.id}/download`} download>
              <Button size="sm" data-testid="download-package">
                <Download className="h-4 w-4" />
                Download ZIP
              </Button>
            </a>
          )}
        </div>
      </div>

      {pkg.files.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {pkg.files.map((file) => (
            <li key={file.path} className="flex items-center justify-between gap-3">
              <span className="truncate font-mono">{file.path}</span>
              <span>
                {formatLabel(file.format)} · {formatNumber(Math.round(file.bytes / 1024))} KB
              </span>
            </li>
          ))}
        </ul>
      )}

      {pkg.error && <Alert tone="danger" className="mt-4">{pkg.error}</Alert>}

      {blockers.length > 0 && (
        <div className="mt-4 space-y-2">
          {blockers.map((check) => (
            <div key={check.id} className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p>{check.message}</p>
            </div>
          ))}
        </div>
      )}

      {reviews.length > 0 && (
        <details className="mt-4 rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            {reviews.length} thing{reviews.length === 1 ? "" : "s"} to check yourself
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {reviews.map((check) => (
              <li key={check.id}>· {check.message}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default function DistributionPage() {
  const params = useParams<{ bookId?: string }>();
  const search = useSearchParams();
  return <Distribution bookId={params.bookId ?? search.get("bookId") ?? ""} />;
}

/**
 * The distribution screen itself.
 *
 * The book id arrives either from the path (`/app/books/[bookId]/distribution`)
 * or from the query (`/app/distribution?bookId=…`).
 */
export function Distribution({ bookId }: { bookId: string }) {
  const destinations = useDestinations();
  const bookExports = useExports(bookId);
  const packages = useDistributionPackages(bookId || null);
  const statuses = usePublishingStatus(bookId || null);
  const prepare = usePreparePackage(bookId);
  const setStatus = useSetPublishingStatus(bookId);

  const [destination, setDestination] = useState<DistributionDestination>("kdp_ebook");
  const [selected, setSelected] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<DistributionMetadata>({ title: "", author: "", language: "en" });
  const [includeCover, setIncludeCover] = useState(true);
  const [showStoreDetails, setShowStoreDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<DistributionPackage | null>(null);

  /**
   * The keyword and category fields are edited as free text and split into
   * lists when the package is prepared.
   *
   * Splitting on every keystroke would rewrite the text under the cursor: the
   * comma and space the author just typed would be replaced by a comma with no
   * space, so "food safety, storage" could never be typed.
   */
  const [keywordText, setKeywordText] = useState("");
  const [categoryText, setCategoryText] = useState("");

  const splitList = (value: string, limit: number) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, limit);

  const profile = useMemo(
    () => destinations.data?.find((item) => item.destination === destination),
    [destinations.data, destination],
  );

  const readyExports = useMemo(
    () => (bookExports.data ?? []).filter((item) => item.status === "ready"),
    [bookExports.data],
  );

  const statusFor = (target: DistributionDestination) =>
    statuses.data?.find((item) => item.destination === target) ?? null;

  if (!bookId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <PageHeader title="Distribution" description="Pick a book to prepare a package for a store." />
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No book selected"
          description="Open distribution from a book's page to assemble a package for a store."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Distribution"
        description="Prepare a package for a store and download it. You upload the file yourself — this product never publishes on your behalf, and it does not know whether a store accepted anything."
      />

      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}
      {problem && <Alert tone="danger" className="mb-6">{problem}</Alert>}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Prepare a package</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Destination" htmlFor="distribution-destination">
            <Select
              id="distribution-destination"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value as DistributionDestination);
                setBlocked(null);
              }}
              data-testid="distribution-destination"
            >
              {(destinations.data ?? []).map((item) => (
                <option key={item.destination} value={item.destination}>
                  {DEST_LABELS[item.destination]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {profile ? (
              <>
                <p className="font-medium text-foreground">
                  Needs {profile.required.length > 0 ? profile.required.map(formatLabel).join(" and ") : "any format"}
                </p>
                <p className="mt-1">
                  Accepts {profile.accepted.map(formatLabel).join(", ")} · largest file{" "}
                  {formatNumber(Math.round(profile.maxFileBytes / 1024 / 1024))} MB
                </p>
                {profile.coverRequired && <p className="mt-1">A cover image is required.</p>}
              </>
            ) : (
              <p>Loading the rules for this destination…</p>
            )}
          </div>

          <Field label="Title" htmlFor="metadata-title">
            <Input
              id="metadata-title"
              value={metadata.title}
              maxLength={200}
              onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
              data-testid="metadata-title"
            />
          </Field>
          <Field label="Author or pen name" htmlFor="metadata-author">
            <Input
              id="metadata-author"
              value={metadata.author}
              maxLength={200}
              onChange={(event) => setMetadata({ ...metadata, author: event.target.value })}
              data-testid="metadata-author"
            />
          </Field>
          <Field label="Language" htmlFor="metadata-language">
            <Input
              id="metadata-language"
              value={metadata.language}
              maxLength={10}
              onChange={(event) => setMetadata({ ...metadata, language: event.target.value })}
              data-testid="metadata-language"
            />
          </Field>
          <Field label="Subtitle (optional)" htmlFor="metadata-subtitle">
            <Input
              id="metadata-subtitle"
              value={metadata.subtitle ?? ""}
              maxLength={300}
              onChange={(event) => setMetadata({ ...metadata, subtitle: event.target.value || undefined })}
            />
          </Field>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setShowStoreDetails((v) => !v)}
              aria-expanded={showStoreDetails}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline"
            >
              {showStoreDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {showStoreDetails ? "Hide store listing details" : "Add store listing details"}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              These fields go into the metadata file that travels with the package. Fill in what your store&apos;s listing form asks for.
            </p>
          </div>

          {showStoreDetails && (
            <>
              <Field label="Description" htmlFor="metadata-description" hint="The blurb your store shows on the listing page." className="sm:col-span-2">
                <Textarea
                  id="metadata-description"
                  rows={5}
                  value={metadata.description ?? ""}
                  maxLength={5000}
                  onChange={(event) => setMetadata({ ...metadata, description: event.target.value || undefined })}
                />
              </Field>
              <Field label="Publisher" htmlFor="metadata-publisher">
                <Input
                  id="metadata-publisher"
                  value={metadata.publisher ?? ""}
                  maxLength={200}
                  onChange={(event) => setMetadata({ ...metadata, publisher: event.target.value || undefined })}
                />
              </Field>
              <Field label="Publication date" htmlFor="metadata-publication-date" hint="For example 2026-01-31.">
                <Input
                  id="metadata-publication-date"
                  value={metadata.publicationDate ?? ""}
                  maxLength={40}
                  onChange={(event) => setMetadata({ ...metadata, publicationDate: event.target.value || undefined })}
                />
              </Field>
              <Field label="ISBN" htmlFor="metadata-isbn" hint="The book's own identifier, when it has one.">
                <Input
                  id="metadata-isbn"
                  value={metadata.isbn ?? ""}
                  maxLength={20}
                  onChange={(event) => setMetadata({ ...metadata, isbn: event.target.value || undefined })}
                />
              </Field>
              <Field label="Store identifier" htmlFor="metadata-asin" hint="The store's own identifier for the book, when you have one.">
                <Input
                  id="metadata-asin"
                  value={metadata.asin ?? ""}
                  maxLength={20}
                  onChange={(event) => setMetadata({ ...metadata, asin: event.target.value || undefined })}
                />
              </Field>
              <Field label="Keywords" htmlFor="metadata-keywords" hint="Up to seven, separated by commas.">
                <Input id="metadata-keywords" value={keywordText} onChange={(event) => setKeywordText(event.target.value)} />
              </Field>
              <Field label="Categories" htmlFor="metadata-categories" hint="Up to three, separated by commas.">
                <Input id="metadata-categories" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-muted-foreground">Files to include</p>
          {bookExports.isPending ? (
            <PageLoader label="Loading your exports…" />
          ) : readyExports.length === 0 ? (
            <Alert tone="info" className="mt-2">
              This book has no finished exports yet. Create a PDF or EPUB export first — a package is assembled
              from your own files.
            </Alert>
          ) : (
            <div className="mt-2 space-y-2">
              {readyExports.map((item) => (
                <label key={item.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                      )
                    }
                    data-testid={`export-option-${item.id}`}
                  />
                  <span className="font-medium">{formatLabel(item.format)}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.fileSize ? `${formatNumber(Math.round(item.fileSize / 1024))} KB` : ""} ·{" "}
                    {timeAgo(item.createdAt)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeCover} onChange={(event) => setIncludeCover(event.target.checked)} />
          Include the book&apos;s cover
        </label>

        <Button
          className="mt-5"
          loading={prepare.isPending}
          disabled={selected.length === 0 || !metadata.title.trim() || !metadata.author.trim()}
          onClick={() => {
            setNotice(null);
            setProblem(null);
            setBlocked(null);
            prepare.mutate(
              {
                destination,
                exportIds: selected,
                includeCover,
                metadata: {
                  ...metadata,
                  ...(keywordText.trim() ? { keywords: splitList(keywordText, 7) } : {}),
                  ...(categoryText.trim() ? { categories: splitList(categoryText, 3) } : {}),
                },
              },
              {
                onSuccess: (result) => {
                  if (result.package.status === "blocked") {
                    setBlocked(result.package);
                    setProblem("The package cannot be assembled yet. The checks below say what is missing.");
                  } else {
                    setNotice("Package assembled. Download it and upload it to the store yourself.");
                  }
                  void packages.refetch();
                },
                onError: (err) => setProblem(errorMessage(err)),
              },
            );
          }}
          data-testid="prepare-package"
        >
          <Package className="h-4 w-4" />
          Prepare package
        </Button>
      </Card>

      {blocked && (
        <div className="mt-4">
          <PackageCard pkg={blocked} />
        </div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Prepared packages</h2>
      {packages.isLoading ? (
        <PageLoader />
      ) : packages.error ? (
        <ErrorState message={errorMessage(packages.error)} onRetry={() => void packages.refetch()} />
      ) : packages.data && packages.data.length > 0 ? (
        <div className="space-y-4">
          {packages.data.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No packages yet"
          description="Prepare one above to get a ZIP you can upload to a store."
        />
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Your publishing status</h2>
      <Alert tone="info" className="mb-4">
        <ShieldCheck className="me-2 inline h-4 w-4" />
        You record this yourself. Only you know whether a store has reviewed or accepted your book.
      </Alert>
      <Card className="divide-y divide-border">
        {(destinations.data ?? []).map((item) => (
          <PublishingStatusRow
            key={item.destination}
            destination={item.destination}
            current={statusFor(item.destination)}
            onChange={(state) =>
              setStatus.mutate(
                { destination: item.destination, state },
                {
                  onSuccess: () => {
                    setNotice("Publishing status recorded.");
                    void statuses.refetch();
                  },
                  onError: (err) => setProblem(errorMessage(err)),
                },
              )
            }
          />
        ))}
      </Card>

      <div className="mt-8 flex justify-end">
        <Button variant="ghost" onClick={() => setNotice(null)}>
          <Send className="h-4 w-4" />
          Nothing is sent anywhere
        </Button>
      </div>
    </div>
  );
}

/**
 * One destination's publishing status.
 *
 * The state is kept locally so the control responds immediately, and the
 * server's answer replaces it once the record is saved.
 */
function PublishingStatusRow({
  destination,
  current,
  onChange,
}: {
  destination: DistributionDestination;
  current: { state: PublishingState; note?: string | null; updatedAt?: string } | null;
  onChange: (state: PublishingState) => void;
}) {
  const [state, setState] = useState<PublishingState>(current?.state ?? "not_prepared");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{DEST_LABELS[destination]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {current?.note ?? "No note"} {current?.updatedAt ? `· updated ${timeAgo(current.updatedAt)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATE_TONE[current?.state ?? "not_prepared"]}>
          {STATE_LABEL[current?.state ?? "not_prepared"]}
        </Badge>
        <Select
          className="h-9 w-auto py-0 text-xs"
          value={state}
          aria-label={`Publishing status for ${DEST_LABELS[destination]}`}
          onChange={(event) => {
            const next = event.target.value as PublishingState;
            setState(next);
            onChange(next);
          }}
          data-testid={`publishing-state-${destination}`}
        >
          {(Object.keys(STATE_LABEL) as PublishingState[]).map((value) => (
            <option key={value} value={value}>
              {STATE_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
