import { z } from "zod";
import { MARKETPLACES, type Marketplace } from "./publishing";

/**
 * S14 — distribution package contract.
 *
 * A distribution package is a ZIP the author downloads and uploads to a
 * store themselves. The product assembles and checks the package; it never
 * publishes to a store, and it never claims a store approved the book.
 *
 * The destination profiles below are the separate rules each store applies.
 * They are kept apart deliberately: a rule that holds for KDP says nothing
 * about Etsy, and the package for one destination is not the package for
 * another.
 */

/** The destinations a package can be prepared for. */
export const DISTRIBUTION_DESTINATIONS = [
  "kdp_ebook",
  "kdp_print",
  "apple_books",
  "etsy",
  "gumroad",
  "direct",
] as const;
export type DistributionDestination = typeof DISTRIBUTION_DESTINATIONS[number];

/** The label a destination is shown under. */
export const DISTRIBUTION_LABELS: Record<DistributionDestination, string> = {
  kdp_ebook: "Amazon KDP — eBook",
  kdp_print: "Amazon KDP — paperback",
  apple_books: "Apple Books for Authors",
  etsy: "Etsy — digital download",
  gumroad: "Gumroad",
  direct: "Own website / other stores",
};

/**
 * The file formats each destination expects.
 *
 * `required` means the destination cannot accept the package without it.
 * `accepted` means the file may be included but is not the delivery format.
 */
export interface DestinationProfile {
  /** The formats the package must contain. */
  required: readonly ("pdf" | "epub" | "docx")[];
  /** The formats the package may also contain. */
  accepted: readonly ("pdf" | "epub" | "docx")[];
  /** The cover image formats the destination accepts. */
  cover: readonly ("jpeg" | "png")[];
  /** Whether a cover image is required. */
  coverRequired: boolean;
  /** The largest a single delivery file may be, in bytes. */
  maxFileBytes: number;
  /** The largest the whole package may be, in bytes. */
  maxPackageBytes: number;
  /** Whether the destination wants a metadata sidecar file. */
  wantsMetadataFile: boolean;
  /** Whether the destination wants the manuscript source as well. */
  wantsSource: boolean;
}

/**
 * The destination profiles.
 *
 * The size limits are the ones the stores publish. They are stated as the
 * limit the package is checked against, so a package that exceeds one is
 * blocked rather than downloaded and rejected by the store.
 */
export const DESTINATION_PROFILES: Record<DistributionDestination, DestinationProfile> = {
  kdp_ebook: {
    required: ["epub"],
    accepted: ["docx", "pdf"],
    cover: ["jpeg"],
    coverRequired: false,
    maxFileBytes: 650 * 1024 * 1024,
    maxPackageBytes: 700 * 1024 * 1024,
    wantsMetadataFile: false,
    wantsSource: false,
  },
  kdp_print: {
    required: ["pdf"],
    accepted: ["docx"],
    cover: ["jpeg"],
    coverRequired: true,
    maxFileBytes: 300 * 1024 * 1024,
    maxPackageBytes: 650 * 1024 * 1024,
    wantsMetadataFile: false,
    wantsSource: true,
  },
  apple_books: {
    required: ["epub"],
    accepted: ["pdf"],
    cover: ["jpeg", "png"],
    coverRequired: false,
    maxFileBytes: 500 * 1024 * 1024,
    maxPackageBytes: 500 * 1024 * 1024,
    wantsMetadataFile: false,
    wantsSource: false,
  },
  etsy: {
    required: ["pdf"],
    accepted: ["epub"],
    cover: ["jpeg", "png"],
    coverRequired: false,
    maxFileBytes: 20 * 1024 * 1024,
    maxPackageBytes: 100 * 1024 * 1024,
    wantsMetadataFile: true,
    wantsSource: false,
  },
  gumroad: {
    required: ["pdf"],
    accepted: ["epub"],
    cover: ["jpeg", "png"],
    coverRequired: false,
    maxFileBytes: 100 * 1024 * 1024,
    maxPackageBytes: 200 * 1024 * 1024,
    wantsMetadataFile: true,
    wantsSource: false,
  },
  direct: {
    required: [],
    accepted: ["pdf", "epub", "docx"],
    cover: ["jpeg", "png"],
    coverRequired: false,
    maxFileBytes: 500 * 1024 * 1024,
    maxPackageBytes: 1024 * 1024 * 1024,
    wantsMetadataFile: true,
    wantsSource: true,
  },
};

/**
 * The metadata a package carries.
 *
 * Every field is optional except the title, because the fields a store
 * requires differ and the product does not invent one the author did not
 * supply.
 */
export const distributionMetadataSchema = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).optional(),
  author: z.string().trim().min(1).max(200),
  language: z.string().trim().min(2).max(10),
  description: z.string().trim().max(5000).optional(),
  /** The store's own identifier for the book, when the author has one. */
  asin: z.string().trim().max(20).optional(),
  isbn: z.string().trim().max(20).optional(),
  keywords: z.array(z.string().trim().min(1).max(50)).max(7).optional(),
  categories: z.array(z.string().trim().min(1).max(80)).max(3).optional(),
  publisher: z.string().trim().max(200).optional(),
  publicationDate: z.string().trim().max(40).optional(),
}).strict();
export type DistributionMetadata = z.infer<typeof distributionMetadataSchema>;

/**
 * The request for a package.
 *
 * The export ids name the files that go into the package. The service checks
 * that each one belongs to the author and to the book, so a package can never
 * carry another author's file.
 */
export const distributionPackageSchema = z.object({
  destination: z.enum(DISTRIBUTION_DESTINATIONS),
  /** The exports to include. Each must be ready and belong to this book. */
  exportIds: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
  metadata: distributionMetadataSchema,
  /** Whether to include the cover image in the package. */
  includeCover: z.boolean().optional().default(true),
  /** A note for the author's checklist. */
  notes: z.string().trim().max(2000).optional(),
}).strict();
export type DistributionPackageInput = z.infer<typeof distributionPackageSchema>;

/** The status of a prepared package. */
export type PackageStatus = "assembling" | "ready" | "blocked" | "failed";

/** A file inside the package. */
export interface PackageFile {
  /** The path inside the ZIP. */
  path: string;
  /** The format the file is in. */
  format: "pdf" | "epub" | "docx" | "jpeg" | "png" | "metadata" | "readme";
  /** The size in bytes. */
  bytes: number;
  /** The export the file came from, when it came from one. */
  exportId?: string;
}

/** One check on a prepared package. */
export interface PackageCheck {
  id: string;
  status: "pass" | "blocker" | "review";
  message: string;
  source?: string;
}

/** A prepared package, ready to download. */
export interface DistributionPackage {
  id: string;
  bookId: string;
  destination: DistributionDestination;
  status: PackageStatus;
  /** The rules version the package was checked against. */
  rulesVersion: string;
  createdAt: string;
  /** The files the package contains. */
  files: PackageFile[];
  /** The total size in bytes. */
  bytes: number;
  /** The checks that were run. */
  checks: PackageCheck[];
  /** The metadata the author supplied. */
  metadata: DistributionMetadata;
  /** The chapter versions captured when the package was made. */
  chapterVersions: { id: string; version: number }[];
  /** The storage key of the ZIP, once it is stored. */
  storageKey?: string;
  /** The reason the package failed, when it did. */
  error?: string;
}

/** The author's own publishing status for a destination. */
export type PublishingState = "not_prepared" | "in_progress" | "submitted" | "published";

/** The request body for updating the author's publishing status. */
export const publishingStatusSchema = z.object({
  destination: z.enum(DISTRIBUTION_DESTINATIONS),
  state: z.enum(["not_prepared", "in_progress", "submitted", "published"]),
  /** The store's reference for the listing, when there is one. */
  externalReference: z.string().trim().max(200).optional(),
  /** A note about what happened. */
  note: z.string().trim().max(1000).optional(),
}).strict();
export type PublishingStatusInput = z.infer<typeof publishingStatusSchema>;

/**
 * The destinations a marketplace list covers.
 *
 * `MARKETPLACES` and `DISTRIBUTION_DESTINATIONS` are not the same list: the
 * publishing checks know about four marketplaces, while a package can be
 * prepared for six destinations. A destination with no marketplace profile
 * still gets a package, with its own rules.
 */
export function isMarketplace(destination: DistributionDestination): destination is Marketplace {
  return (MARKETPLACES as readonly string[]).includes(destination);
}

/**
 * The checks a prepared package has to pass.
 *
 * The checks are about the package, not about whether the store will accept
 * the book. A package that passes every check can still be refused by the
 * store, and the interface never says otherwise.
 */
export function packageChecks(input: {
  destination: DistributionDestination;
  profile: DestinationProfile;
  files: { format: string; bytes: number }[];
  metadata: DistributionMetadata;
  chapters: { status: string; wordCount: number }[];
  hasCover: boolean;
}): PackageCheck[] {
  const checks: PackageCheck[] = [];
  const check = (id: string, ok: boolean, message: string, source?: string) =>
    checks.push({ id, status: ok ? "pass" : "blocker", message, source });
  const review = (id: string, message: string, source?: string) =>
    checks.push({ id, status: "review", message, source });

  const { profile, files } = input;

  for (const format of profile.required) {
    check(
      `format_${format}`,
      files.some((file) => file.format === format),
      `The package must contain a ${format.toUpperCase()} file for this destination.`,
    );
  }

  for (const file of files) {
    if (file.bytes > profile.maxFileBytes) {
      checks.push({
        id: `size_${file.format}`,
        status: "blocker",
        message: `A ${file.format.toUpperCase()} file in the package is ${Math.round(file.bytes / 1024 / 1024)} MB. This destination accepts at most ${Math.round(profile.maxFileBytes / 1024 / 1024)} MB.`,
      });
    }
  }

  if (profile.coverRequired) {
    check("cover", input.hasCover, "This destination needs a cover image in the package.");
  } else {
    review("cover", "Check the cover image against the destination's current cover guidance.");
  }

  check(
    "chapters",
    input.chapters.length > 0 && input.chapters.every((chapter) => chapter.status === "done" && chapter.wordCount > 0),
    "Every chapter must be finished before the package is assembled.",
  );

  check("title", !!input.metadata.title.trim(), "The package needs a title.");
  check("author", !!input.metadata.author.trim(), "The package needs an author or pen name.");
  check("language", !!input.metadata.language.trim(), "The package needs a language.");

  review(
    "rights",
    "Confirm you hold commercial rights to the text, images and fonts in this package, including anything generated or imported.",
  );
  review(
    "proofreading",
    "Read the files in this package end to end before you upload them. The package matches the manuscript at the moment it was assembled.",
  );
  review(
    "store_review",
    "The store reviews every submission itself. This package does not claim the store will accept it.",
  );

  return checks;
}
