"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, ExternalLink, Sparkles, TrendingUp } from "lucide-react";
import {
  DISTRIBUTION_LABELS as DEST_LABELS,
  type DistributionDestination,
  type ListingCopy,
} from "@ebook/shared";

import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import {
  useListingGaps,
  useListingDestinations,
  useListings,
  usePrepareListing,
  useRoyaltyQuote,
  useUpdateListing,
} from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/**
 * Marketplace listing copy.
 *
 * The screen prepares the text an author pastes into a store's own listing
 * form and shows what they would keep at the price they chose. Two boundaries
 * are stated on the screen rather than left implied:
 *
 * - **Nothing is submitted.** No store is contacted. The author copies the
 *   text into the store's own form and submits it there.
 * - **The royalty figure is an estimate.** It applies the store's published
 *   rate to the chosen price. It is not a payout, and it does not model
 *   payment processing, taxes, refunds or advertising.
 *
 * Every draft is tied to the chapter versions it was written from, so a
 * listing whose manuscript has moved on is marked stale.
 */

/** The destinations the author can prepare a listing for. */
const DESTINATIONS: DistributionDestination[] = [
  "kdp_ebook",
  "kdp_print",
  "apple_books",
  "etsy",
  "gumroad",
  "direct",
];

/** The price the author starts from, in cents. */
const DEFAULT_PRICE = 599;

/** The field a listing shows when it is empty and required. */
function FieldInput({
  field,
  onChange,
  onConfirm,
}: {
  field: ListingCopy["fields"][number];
  onChange: (value: string) => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const isLong = field.key === "description";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`listing-field-${field.key}`} className="text-sm font-semibold">
          {field.label}
          {field.required ? <span className="ml-1 text-danger">*</span> : null}
        </label>
        <span className="flex items-center gap-2">
          {field.maxLength ? (
            <span
              className={`text-xs ${field.withinLimit ? "text-muted-foreground" : "text-danger"}`}
            >
              {field.value.length}/{field.maxLength}
            </span>
          ) : null}
          {field.confirmed ? (
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Confirmed
            </Badge>
          ) : null}
        </span>
      </div>

      {isLong ? (
        <Textarea
          id={`listing-field-${field.key}`}
          data-testid={`listing-field-${field.key}`}
          value={field.value}
          rows={8}
          className="bg-background"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={`listing-field-${field.key}`}
          data-testid={`listing-field-${field.key}`}
          type="text"
          value={field.value}
          className="bg-background"
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {field.note ? (
          <p className={`text-xs ${field.withinLimit ? "text-muted-foreground" : "text-danger"}`}>{field.note}</p>
        ) : (
          <span />
        )}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={field.confirmed}
            onChange={(event) => onConfirm(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          I have checked this
        </label>
      </div>
    </div>
  );
}

/** The royalty estimate for the chosen price. */
function RoyaltyPanel({
  destination,
  priceInMinorUnits,
}: {
  destination: DistributionDestination;
  priceInMinorUnits: number;
}) {
  const quote = useRoyaltyQuote(destination, priceInMinorUnits);

  if (quote.isLoading) return <PageLoader label="Working out the royalty…" />;
  if (quote.isError) return <ErrorState message={errorMessage(quote.error)} onRetry={() => void quote.refetch()} />;
  const estimate = quote.data;
  if (!estimate) return null;

  const money = (minor: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(minor / 100);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">What you would keep</h3>
      </div>

      <p className="mt-3 text-2xl font-bold">{money(estimate.authorShareInMinorUnits)}</p>
      <p className="text-xs text-muted-foreground">
        of a {money(estimate.priceInMinorUnits)} price, before any store fees, payment processing, tax or
        advertising.
      </p>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">The store takes</dt>
          <dd className="font-medium">{money(estimate.storeShareInMinorUnits)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Your share</dt>
          <dd className="font-medium">{Math.round(estimate.authorShareRate * 100)}%</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{estimate.note}</p>
      {estimate.warning ? (
        <Alert tone="warning" className="mt-3">
          {estimate.warning}
        </Alert>
      ) : null}

      <a
        href={estimate.source}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
      >
        Read the store&apos;s current terms
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </Card>
  );
}

/** One prepared listing. */
function ListingEditor({ listing, onCopied }: { listing: ListingCopy; onCopied: () => void }) {
  const save = useUpdateListing();
  // The server decides which required fields are still missing and whether
  // the listing has fallen behind the manuscript. The screen does not
  // second-guess that, so it shows what the store's own form will accept.
  const gaps = useListingGaps(listing.id);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [price, setPrice] = useState(listing.royalty.priceInMinorUnits);

  // The saved listing is the baseline; the local draft holds the author's
  // unsaved changes on top of it.
  const value = (key: string) => draft[key] ?? listing.fields.find((f) => f.key === key)?.value ?? "";
  const isConfirmed = (key: string) =>
    confirmed[key] ?? listing.fields.find((f) => f.key === key)?.confirmed ?? false;

  const changed =
    Object.keys(draft).length > 0 ||
    Object.keys(confirmed).length > 0 ||
    price !== listing.royalty.priceInMinorUnits;

  const missing = gaps.data?.missing ?? [];
  const overLimit = listing.fields.filter((field) => {
    const spec = listing.fields.find((f) => f.key === field.key)!;
    return spec.maxLength !== undefined && value(field.key).length > spec.maxLength;
  });

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        listingId: listing.id,
        baseVersion: listing.version,
        priceInMinorUnits: price,
        fields: draft,
        confirmed,
      });
      setDraft({});
      setConfirmed({});
    } catch {
      // The error is shown by the alert below; the draft is kept.
    }
  };

  const copyAll = async () => {
    const text = listing.fields
      .filter((field) => value(field.key).trim())
      .map((field) => `## ${field.label}\n${value(field.key)}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    onCopied();
  };

  return (
    <Card className="p-5" data-testid={`listing-${listing.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {DEST_LABELS[listing.destination]}
            <Badge tone="neutral">v{listing.version}</Badge>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Prepared {timeAgo(listing.createdAt)} · {listing.sourceChapterVersions.length} chapter
            {listing.sourceChapterVersions.length === 1 ? "" : "s"} behind it
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void copyAll()} data-testid="listing-copy">
          <Copy className="h-4 w-4" aria-hidden />
          Copy all
        </Button>
      </div>

      {missing.length > 0 ? (
        <Alert tone="warning" className="mt-4">
          {missing.length} required field{missing.length === 1 ? "" : "s"} still need a value before the
          store&apos;s own form will accept this listing.
          <ul className="mt-2 list-inside list-disc space-y-0.5">
            {missing.map((field) => (
              <li key={field.key}>{field.label}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {gaps.data?.stale ? (
        <Alert tone="warning" className="mt-3">
          Your manuscript has changed since this listing was drafted. Read it through again before you
          use it, and re-draft it if the content no longer matches.
        </Alert>
      ) : null}

      {overLimit.length > 0 ? (
        <Alert tone="danger" className="mt-3">
          {overLimit.map((field) => field.label).join(", ")} {overLimit.length === 1 ? "is" : "are"} over the
          store&apos;s character limit.
        </Alert>
      ) : null}

      {save.isError ? (
        <Alert tone="danger" className="mt-3">
          {errorMessage(save.error)}
        </Alert>
      ) : null}

      <div className="mt-5 space-y-5">
        {listing.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={{ ...field, value: value(field.key), confirmed: isConfirmed(field.key) }}
            onChange={(next) => setDraft((current) => ({ ...current, [field.key]: next }))}
            onConfirm={(next) => setConfirmed((current) => ({ ...current, [field.key]: next }))}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Field label="Price" htmlFor="listing-price">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              id="listing-price"
              type="number"
              min={0}
              step="0.01"
              value={(price / 100).toFixed(2)}
              className="w-28 bg-background"
              onChange={(event) => setPrice(Math.max(0, Math.round(Number(event.target.value) * 100)))}
            />
          </div>
        </Field>
        <Button onClick={() => void handleSave()} loading={save.isPending} disabled={!changed} data-testid="listing-save">
          Save listing
        </Button>
      </div>

      {save.isSuccess && !changed ? (
        <p className="mt-3 text-xs text-success" role="status">
          Saved.
        </p>
      ) : null}
    </Card>
  );
}

/** The listing studio screen. */
export function ListingStudio({ bookId }: { bookId: string }) {
  const destinations = useListingDestinations();
  const listings = useListings(bookId);
  const prepare = usePrepareListing(bookId);
  const [destination, setDestination] = useState<DistributionDestination>("kdp_ebook");
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const profile = useMemo(
    () => destinations.data?.find((entry) => entry.destination === destination),
    [destinations.data, destination],
  );

  if (destinations.isLoading || listings.isLoading) return <PageLoader label="Loading the listing studio…" />;
  if (destinations.isError) {
    return <ErrorState message={errorMessage(destinations.error)} onRetry={() => void destinations.refetch()} />;
  }
  if (listings.isError) {
    return <ErrorState message={errorMessage(listings.error)} onRetry={() => void listings.refetch()} />;
  }

  // The query data is narrowed once, so the screen below does not have to
  // repeat the undefined check at every use.
  const prepared = listings.data ?? [];

  const handlePrepare = async () => {
    try {
      await prepare.mutateAsync({ destination, priceInMinorUnits: price });
    } catch {
      // The error is shown below; nothing is silently swallowed.
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listing copy"
        description="Prepare the text your store's listing form asks for, and see what you would keep at your price."
      />

      <Alert tone="info">
        eBookStudio drafts the listing text and works out the royalty. It does not submit anything to a
        store — you paste the text into the store&apos;s own form and publish there yourself. No store has
        approved anything.
      </Alert>

      {copied ? (
        <Alert tone="success">
          Copied to your clipboard. Paste it into the store&apos;s own listing form.
        </Alert>
      ) : null}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Prepare a listing</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The draft is written from your own manuscript. It costs 3 credits.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Destination" htmlFor="listing-destination">
            <Select
              id="listing-destination"
              data-testid="listing-destination"
              value={destination}
              className="bg-background"
              onChange={(event) => setDestination(event.target.value as DistributionDestination)}
            >
              {DESTINATIONS.map((value) => (
                <option key={value} value={value}>
                  {DEST_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Price" htmlFor="listing-new-price">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                id="listing-new-price"
                data-testid="listing-new-price"
                type="number"
                min={0}
                step="0.01"
                value={(price / 100).toFixed(2)}
                className="w-28 bg-background"
                onChange={(event) => setPrice(Math.max(0, Math.round(Number(event.target.value) * 100)))}
              />
            </div>
          </Field>
        </div>

        {profile ? (
          <p className="mt-3 text-xs text-muted-foreground">{profile.royaltyNote}</p>
        ) : null}

        {prepare.isError ? (
          <Alert tone="danger" className="mt-4">
            {errorMessage(prepare.error)}
          </Alert>
        ) : null}

        <div className="mt-5">
          <Button onClick={() => void handlePrepare()} loading={prepare.isPending} data-testid="listing-prepare">
            <Sparkles className="h-4 w-4" aria-hidden />
            Draft the listing
          </Button>
        </div>
      </Card>

      <RoyaltyPanel destination={destination} priceInMinorUnits={price} />

      {prepared.length === 0 ? (
        <EmptyState
          icon={<CircleAlert className="h-6 w-6" aria-hidden />}
          title="No listing prepared yet"
          description="Choose a destination above and draft a listing. You can edit every field before you use it."
        />
      ) : (
        <div className="space-y-5">
          {prepared.map((listing) => (
            <ListingEditor key={listing.id} listing={listing} onCopied={() => setCopied(true)} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {formatNumber(prepared.length)} listing{prepared.length === 1 ? "" : "s"} prepared for this book.
      </p>
    </div>
  );
}

/**
 * The route wrapper.
 *
 * The screen itself lives at `/app/listing?bookId=…` so it can also be opened
 * directly. This route only supplies the book id from the path.
 */
export default function BookListingPage() {
  const params = useParams<{ bookId: string }>();
  const search = useSearchParams();
  const bookId = search.get("bookId") ?? params?.bookId ?? "";
  return <ListingStudio bookId={bookId} />;
}
