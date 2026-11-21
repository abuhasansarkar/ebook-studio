import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import archiver from "archiver";
import {
  DESTINATION_PROFILES,
  packageChecks,
  type DistributionDestination,
  type DistributionMetadata,
  type DistributionPackage,
  type PackageCheck,
  type PackageFile,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { storage } from "../storage/storage.js";
import { getOwnedBook } from "../books/bookService.js";
import { conflict, badRequest, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/**
 * S14 — distribution packages.
 *
 * The product assembles a ZIP the author downloads and uploads to a store
 * themselves. Two rules hold throughout:
 *
 * - The package carries only the author's own files. Every export id is
 *   checked against the author and the book before it is read.
 * - The package matches a fixed snapshot. The chapter versions are recorded
 *   with it, so a download can be traced to the manuscript it came from.
 *
 * The product never publishes to a store and never claims a store accepted the
 * book. A package that passes every check can still be refused by the store.
 */

/** The destination rules version this build applies. */
export const DISTRIBUTION_RULES_VERSION = "2026-11-25.1";

/** A file-safe name for the package. */
function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return slug || "ebook";
}

/** The format of an export, narrowed to the ones a package can carry. */
type PackageFormat = "pdf" | "epub" | "docx";
/** The format of a file inside the package, including the images and sidecars. */
type ContainedFormat = PackageFormat | "jpeg" | "png" | "metadata" | "readme";

/** Reads a stored file into memory. */
async function readStored(storageKey: string): Promise<Buffer> {
  const { stream } = await storage.getStream(storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * The cover of a book, when one has been chosen and the artwork is still
 * stored.
 */
async function findCover(userId: string, bookId: string): Promise<{ assetId: string; bytes: Buffer } | null> {
  const cover = await prisma.coverDesign.findFirst({
    where: { bookId },
    orderBy: { version: "desc" },
    select: { data: true },
  });
  const artworkId = (cover?.data as { artworkId?: string | null } | undefined)?.artworkId;
  if (!artworkId) return null;
  const asset = await prisma.asset.findFirst({
    where: { id: artworkId, userId, status: "ready" },
    select: { id: true, storageKey: true },
  });
  if (!asset) return null;
  return { assetId: asset.id, bytes: await readStored(asset.storageKey) };
}

/** The metadata file the package carries, when the destination wants one. */
function metadataFile(metadata: DistributionMetadata, destination: DistributionDestination): Buffer {
  const payload = {
    destination,
    rulesVersion: DISTRIBUTION_RULES_VERSION,
    metadata,
    preparedBy: "eBookStudio",
    notice:
      "This file describes the book for the store's listing form. It is a starting point you review and edit — it is not a submission, and no store has approved these details.",
  };
  return Buffer.from(JSON.stringify(payload, null, 2), "utf8");
}

/** The checklist the author works through before uploading. */
function readmeFile(destination: DistributionDestination, files: PackageFile[]): Buffer {
  const lines = [
    `# ${destination.replace(/_/g, " ")} — distribution package`,
    "",
    "This package was assembled by eBookStudio from your manuscript and your exports.",
    "",
    "## What is in here",
    "",
    ...files.map((file) => `- \`${file.path}\` (${(file.bytes / 1024 / 1024).toFixed(1)} MB)`),
    "",
    "## Before you upload",
    "",
    "1. Open every file and read it end to end.",
    "2. Confirm you hold commercial rights to the text, images and fonts.",
    "3. Check the file against the store's current requirements — they change.",
    "4. Upload the files yourself. eBookStudio does not publish to any store.",
    "",
    "The store reviews every submission itself. This package does not claim the store will accept it.",
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

/**
 * Prepares a distribution package.
 *
 * The checks run first. A package with a blocker is recorded as blocked and
 * no ZIP is written, because a package the author cannot use is worse than a
 * clear refusal.
 */
export async function preparePackage(
  userId: string,
  bookId: string,
  input: {
    destination: DistributionDestination;
    exportIds: string[];
    metadata: DistributionMetadata;
    includeCover: boolean;
    notes?: string;
  },
): Promise<DistributionPackage> {
  const book = await getOwnedBook(userId, bookId);
  const profile = DESTINATION_PROFILES[input.destination];
  if (!profile) throw badRequest("Choose a supported destination.");

  // Every export must be the author's, belong to this book, and be ready.
  const exports = await prisma.export.findMany({
    where: { id: { in: input.exportIds }, userId, bookId, book: { deletedAt: null } },
  });
  const found = new Set(exports.map((row) => row.id));
  const missing = input.exportIds.filter((id) => !found.has(id));
  if (missing.length) {
    throw notFound("Export");
  }
  const notReady = exports.filter((row) => row.status !== "ready" || !row.storageKey);
  if (notReady.length) {
    throw conflict("One of the exports is not ready yet. Wait for it to finish and try again.");
  }

  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { position: "asc" },
    select: { id: true, version: true, status: true, wordCount: true },
  });
  const chapterVersions = chapters.map(({ id, version }) => ({ id, version }));

  const cover = input.includeCover ? await findCover(userId, bookId) : null;

  // The files the package will hold, before the checks run.
  const planned: { format: ContainedFormat; path: string; bytes: number; exportId?: string }[] = [];
  const base = slugify(input.metadata.title);
  for (const row of exports) {
    const format = row.format as PackageFormat;
    planned.push({
      format,
      path: `${base}.${format}`,
      bytes: row.fileSize ?? 0,
      exportId: row.id,
    });
  }
  if (cover) {
    planned.push({ format: "jpeg", path: `${base}-cover.jpg`, bytes: cover.bytes.length });
  }

  const checks: PackageCheck[] = packageChecks({
    destination: input.destination,
    profile,
    files: planned.map(({ format, bytes }) => ({ format, bytes })),
    metadata: input.metadata,
    chapters,
    hasCover: Boolean(cover),
  });

  const blocked = checks.some((check) => check.status === "blocker");
  const packageBytes = planned.reduce((sum, file) => sum + file.bytes, 0);
  if (packageBytes > profile.maxPackageBytes) {
    checks.push({
      id: "package_size",
      status: "blocker",
      message: `The package would be ${Math.round(packageBytes / 1024 / 1024)} MB. This destination accepts at most ${Math.round(profile.maxPackageBytes / 1024 / 1024)} MB.`,
    });
  }

  const record = await prisma.distributionPackage.create({
    data: {
      userId,
      bookId,
      destination: input.destination,
      status: blocked ? "blocked" : "assembling",
      rulesVersion: DISTRIBUTION_RULES_VERSION,
      files: planned as unknown as object,
      bytes: packageBytes,
      checks: checks as unknown as object,
      metadata: input.metadata as unknown as object,
      chapterVersions: chapterVersions as unknown as object,
    },
  });

  if (blocked) {
    const reason = checks.find((check) => check.status === "blocker")?.message ?? "The package is not ready.";
    await prisma.distributionPackage.update({
      where: { id: record.id },
      data: { status: "blocked", error: reason },
    });
    return toPackage(record.id);
  }

  // The ZIP is assembled on disk and then stored, so a large package never
  // has to fit in memory twice.
  const workingDirectory = path.join(tmpdir(), `ebookstudio-package-${record.id}`);
  await mkdir(workingDirectory, { recursive: true });
  const zipPath = path.join(workingDirectory, `${base}.zip`);

  try {
    // The bodies are read before the archive is opened, so a read failure
    // does not leave a half-written ZIP behind.
    const bodies: { path: string; format: ContainedFormat; body: Buffer; exportId?: string }[] = [];
    for (const file of planned) {
      if (file.format === "jpeg") {
        bodies.push({ path: file.path, format: "jpeg", body: cover!.bytes });
        continue;
      }
      const row = exports.find((candidate) => candidate.id === file.exportId)!;
      bodies.push({ path: file.path, format: file.format, body: await readStored(row.storageKey!), exportId: row.id });
    }
    if (profile.wantsMetadataFile) {
      bodies.push({ path: "metadata.json", format: "metadata", body: metadataFile(input.metadata, input.destination) });
    }

    const files: PackageFile[] = [];
    const readme = readmeFile(
      input.destination,
      bodies.map((entry) => ({ path: entry.path, format: entry.format, bytes: entry.body.length, exportId: entry.exportId })),
    );
    bodies.push({ path: "README.txt", format: "readme", body: readme });

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);

      for (const entry of bodies) {
        archive.append(entry.body, { name: entry.path });
        files.push({ path: entry.path, format: entry.format, bytes: entry.body.length, exportId: entry.exportId });
      }

      archive.finalize();
    });

    const { readFile, stat } = await import("node:fs/promises");
    const info = await stat(zipPath);
    const storageKey = `packages/${userId}/${record.id}/${base}.zip`;
    await storage.put(storageKey, await readFile(zipPath), "application/zip");

    await prisma.distributionPackage.update({
      where: { id: record.id },
      data: {
        status: "ready",
        storageKey,
        bytes: info.size,
        files: files as unknown as object,
      },
    });

    logger.info({ packageId: record.id, destination: input.destination, bytes: info.size }, "Distribution package assembled");
    return toPackage(record.id);
  } catch (err) {
    await prisma.distributionPackage.update({
      where: { id: record.id },
      data: { status: "failed", error: (err as Error).message },
    });
    throw err;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

/** The package as the API returns it. */
async function toPackage(id: string): Promise<DistributionPackage> {
  const row = await prisma.distributionPackage.findUniqueOrThrow({ where: { id } });
  return {
    id: row.id,
    bookId: row.bookId,
    destination: row.destination as DistributionDestination,
    status: row.status as DistributionPackage["status"],
    rulesVersion: row.rulesVersion,
    createdAt: row.createdAt.toISOString(),
    files: row.files as unknown as PackageFile[],
    bytes: row.bytes,
    checks: row.checks as unknown as PackageCheck[],
    metadata: row.metadata as unknown as DistributionMetadata,
    chapterVersions: row.chapterVersions as unknown as { id: string; version: number }[],
    storageKey: row.storageKey ?? undefined,
    error: row.error ?? undefined,
  };
}

/** Reads a package, as the API returns it. */
export async function getPackage(userId: string, packageId: string): Promise<DistributionPackage> {
  const row = await prisma.distributionPackage.findFirst({
    where: { id: packageId, userId, book: { deletedAt: null } },
  });
  if (!row) throw notFound("Package");
  return {
    id: row.id,
    bookId: row.bookId,
    destination: row.destination as DistributionDestination,
    status: row.status as DistributionPackage["status"],
    rulesVersion: row.rulesVersion,
    createdAt: row.createdAt.toISOString(),
    files: row.files as unknown as PackageFile[],
    bytes: row.bytes,
    checks: row.checks as unknown as PackageCheck[],
    metadata: row.metadata as unknown as DistributionMetadata,
    chapterVersions: row.chapterVersions as unknown as { id: string; version: number }[],
    storageKey: row.storageKey ?? undefined,
    error: row.error ?? undefined,
  };
}

/** The packages for a book, newest first. */
export async function listPackages(userId: string, bookId: string): Promise<DistributionPackage[]> {
  await getOwnedBook(userId, bookId);
  const [rows, chapters] = await Promise.all([
    prisma.distributionPackage.findMany({ where: { userId, bookId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.chapter.findMany({ where: { bookId }, select: { id: true, version: true } }),
  ]);
  const current = new Map(chapters.map((c) => [c.id, c.version]));
  const packages = await Promise.all(rows.map((row) => getPackage(userId, row.id)));
  // A package is out of date when any chapter was edited, added or removed after it was made.
  return packages.map((pkg) => ({
    ...pkg,
    stale: pkg.chapterVersions.length !== current.size || pkg.chapterVersions.some((c) => current.get(c.id) !== c.version),
  }));
}

/** The ZIP of a package, for download. */
export async function getPackageForDownload(userId: string, packageId: string) {
  const row = await prisma.distributionPackage.findFirst({
    where: { id: packageId, userId, book: { deletedAt: null } },
    include: { book: { select: { title: true } } },
  });
  if (!row) throw notFound("Package");
  if (row.status !== "ready" || !row.storageKey) throw conflict("This package is not ready to download.");
  const { stream, size } = await storage.getStream(row.storageKey);
  return {
    stream,
    size,
    filename: `${slugify(row.book.title)}-${row.destination}.zip`,
    contentType: "application/zip",
  };
}

/**
 * Records the author's own publishing status for a destination.
 *
 * The author sets this. The product records it and never changes it, because
 * only the author knows whether a store accepted the book.
 */
export async function setPublishingStatus(
  userId: string,
  bookId: string,
  input: { destination: DistributionDestination; state: string; externalReference?: string; note?: string },
) {
  await getOwnedBook(userId, bookId);
  return prisma.publishingStatus.upsert({
    where: { userId_bookId_destination: { userId, bookId, destination: input.destination } },
    create: {
      userId,
      bookId,
      destination: input.destination,
      state: input.state,
      externalReference: input.externalReference ?? null,
      note: input.note ?? null,
    },
    update: {
      state: input.state,
      externalReference: input.externalReference ?? null,
      note: input.note ?? null,
      updatedAt: new Date(),
    },
  });
}

/** The publishing statuses for a book. */
export async function listPublishingStatus(userId: string, bookId: string) {
  await getOwnedBook(userId, bookId);
  const rows = await prisma.publishingStatus.findMany({ where: { userId, bookId } });
  return rows.map((row) => ({
    destination: row.destination as DistributionDestination,
    state: row.state,
    externalReference: row.externalReference,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * The destinations a book can be prepared for, with the rules that apply.
 *
 * The interface shows the profile so the author can see what a destination
 * needs before starting, rather than after a failed download.
 */
export function destinationProfiles() {
  return Object.entries(DESTINATION_PROFILES).map(([destination, profile]) => ({
    destination: destination as DistributionDestination,
    required: profile.required,
    accepted: profile.accepted,
    cover: profile.cover,
    coverRequired: profile.coverRequired,
    maxFileBytes: profile.maxFileBytes,
    maxPackageBytes: profile.maxPackageBytes,
    wantsMetadataFile: profile.wantsMetadataFile,
    wantsSource: profile.wantsSource,
  }));
}
