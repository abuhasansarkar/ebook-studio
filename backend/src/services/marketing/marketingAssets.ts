import sharp from "sharp";
import {
  MARKETING_GRAPHIC_SIZES,
  type MarketingGraphic,
  type MarketingGraphicTemplate,
  type SampleChapterInput,
} from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { storage } from "../storage/storage.js";
import { getBrowser } from "../exports/pdfRenderer.js";
import { getOwnedBook } from "../books/bookService.js";
import { buildBookDocument } from "../design/bookDocument.js";
import { designService } from "../design/designService.js";
import { fontRegistry } from "../design/fonts.js";
import { renderExport } from "../exports/renderers.js";
import { parseExportOptions, loadPinnedImages, referencedAssetIds, findCoverAsset } from "../exports/exportService.js";
import { validateExport } from "../exports/validators.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/**
 * S15 — the downloadable artefacts.
 *
 * Two things are produced here: a promotional graphic and a sample chapter
 * pack. Both are **files the author downloads and uses themselves**. Neither
 * is published, emailed or posted anywhere, and there is no outbound call in
 * this module.
 *
 * The graphic is rendered locally with the same headless browser the cover
 * studio uses, so no external image service ever sees the author's text. The
 * sample pack is assembled from the manuscript's own chapter versions, through
 * the same renderer and the same validator the export path uses, so a sample
 * that would not open is refused rather than offered as a download.
 */

/** The formats a sample pack can be produced in. */
const SAMPLE_FORMATS = ["pdf", "epub", "docx"] as const;
type SampleFormat = (typeof SAMPLE_FORMATS)[number];

/** How many chapters a sample pack may contain. */
const MAX_SAMPLE_CHAPTERS = 5;

const CONTENT_TYPES: Record<SampleFormat, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * The graphic as the API returns it.
 */
export interface MarketingSample {
  id: string;
  bookId: string;
  chapterIds: string[];
  chapterTitles: string[];
  format: SampleFormat;
  fileSize: number;
  ready: boolean;
  createdAt: string;
}

/**
 * Renders a promotional graphic to an image.
 *
 * The HTML is built from the author's own text and the template's colours.
 * Nothing is fetched from the network: the page aborts every request that is
 * not a data URL, so a template can never pull in a remote image or a
 * tracking script.
 */
export async function renderGraphic(
  userId: string,
  graphic: {
    template: MarketingGraphicTemplate;
    width: number;
    height: number;
    headline: string;
    subhead: string | null;
    callToAction: string | null;
    textColor: string;
    backgroundColor: string;
    usedCover: boolean;
  },
  coverDataUrl?: string,
): Promise<Buffer> {
  const html = graphicHtml(graphic, coverDataUrl);
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: graphic.width, height: graphic.height, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      void (req.url().startsWith("data:") ? req.continue() : req.abort());
    });
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const failure = await page.evaluate(() => {
      if (Array.from(document.images).some((i) => !i.complete || !i.naturalWidth)) {
        return "The cover artwork could not be loaded.";
      }
      const overflow = Array.from(document.querySelectorAll<HTMLElement>("[data-layer]")).find(
        (e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1,
      );
      return overflow ? `The ${overflow.dataset.layer} text does not fit. Shorten it or enlarge the text box.` : null;
    });
    if (failure) throw badRequest(failure);
    const buffer = Buffer.from(await page.screenshot({ type: "png", fullPage: false }));
    // The file is only accepted when it is really the size and format the
    // template promises, so a broken render cannot be offered as a download.
    const info = await sharp(buffer).metadata();
    if (info.width !== graphic.width || info.height !== graphic.height || info.format !== "png") {
      throw new Error("Invalid graphic output");
    }
    return buffer;
  } finally {
    await page.close();
  }
}

/** The HTML a template renders from. */
function graphicHtml(
  graphic: {
    template: MarketingGraphicTemplate;
    width: number;
    height: number;
    headline: string;
    subhead: string | null;
    callToAction: string | null;
    textColor: string;
    backgroundColor: string;
    usedCover: boolean;
  },
  coverDataUrl?: string,
): string {
  const cover = graphic.usedCover && coverDataUrl
    ? `<img data-layer="cover" src="${coverDataUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />`
    : "";
  const shade = graphic.usedCover && coverDataUrl
    ? `<div data-layer="shade" style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.72));"></div>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${graphic.width}px; height: ${graphic.height}px; overflow: hidden;
    background: ${graphic.backgroundColor}; color: ${graphic.textColor};
    font-family: Georgia, 'Times New Roman', serif;
  }
  .frame { position: relative; width: 100%; height: 100%; overflow: hidden; padding: 8%; display: flex; flex-direction: column; justify-content: flex-end; }
  .headline { font-size: ${Math.round(graphic.width * 0.075)}px; line-height: 1.12; font-weight: 700; margin: 0 0 ${Math.round(graphic.width * 0.03)}px 0; }
  .subhead { font-size: ${Math.round(graphic.width * 0.036)}px; line-height: 1.35; margin: 0 0 ${Math.round(graphic.width * 0.05)}px 0; opacity: 0.92; }
  .cta { display: inline-block; align-self: flex-start; font-size: ${Math.round(graphic.width * 0.034)}px; line-height: 1.2; padding: ${Math.round(graphic.width * 0.02)}px ${Math.round(graphic.width * 0.04)}px; border: 2px solid currentColor; border-radius: 999px; }
</style></head>
<body>
  <div class="frame">
    ${cover}${shade}
    <h1 data-layer="headline" class="headline">${escapeText(graphic.headline)}</h1>
    ${graphic.subhead ? `<p data-layer="subhead" class="subhead">${escapeText(graphic.subhead)}</p>` : ""}
    ${graphic.callToAction ? `<span data-layer="call to action" class="cta">${escapeText(graphic.callToAction)}</span>` : ""}
  </div>
</body></html>`;
}

/** Escapes the author's text for the HTML template. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Composes and renders a promotional graphic, and records where the file is.
 *
 * The row is written first so an interrupted render leaves a discoverable
 * record rather than an orphan file. The file is only marked ready when the
 * bytes read back from storage are the image the template promised.
 */
export async function composeGraphic(
  userId: string,
  bookId: string,
  input: {
    template: MarketingGraphicTemplate;
    headline: string;
    subhead?: string;
    callToAction?: string;
    textColor: string;
    backgroundColor: string;
    useCover: boolean;
  },
): Promise<MarketingGraphic> {
  await getOwnedBook(userId, bookId);
  const size = MARKETING_GRAPHIC_SIZES[input.template];

  const row = await prisma.marketingGraphic.create({
    data: {
      userId,
      bookId,
      template: input.template,
      width: size.width,
      height: size.height,
      headline: input.headline,
      subhead: input.subhead ?? null,
      callToAction: input.callToAction ?? null,
      textColor: input.textColor,
      backgroundColor: input.backgroundColor,
      usedCover: input.useCover,
    },
  });

  try {
    // The cover is read from the private asset pipeline, so the graphic carries
    // exactly the bytes the author approved.
    let coverDataUrl: string | undefined;
    if (input.useCover) {
      const coverAssetId = await findCoverAsset(userId, bookId);
      if (coverAssetId) {
        const { cover } = await loadPinnedImages(userId, [], coverAssetId);
        if (cover) coverDataUrl = `data:${cover.mediaType};base64,${Buffer.from(cover.bytes).toString("base64")}`;
      }
    }
    const buffer = await renderGraphic(
      userId,
      {
        template: row.template as MarketingGraphicTemplate,
        width: row.width,
        height: row.height,
        headline: row.headline,
        subhead: row.subhead,
        callToAction: row.callToAction,
        textColor: row.textColor,
        backgroundColor: row.backgroundColor,
        usedCover: row.usedCover,
      },
      coverDataUrl,
    );
    const key = `marketing/${userId}/${bookId}/${row.id}.png`;
    await storage.put(key, buffer, "image/png");
    await prisma.marketingGraphic.update({ where: { id: row.id }, data: { storageKey: key, ready: true } });
  } catch (err) {
    // A graphic that could not be rendered is reported as not ready. The record
    // stays so the author can see what was attempted.
    logger.warn({ err, graphicId: row.id }, "Promotional graphic could not be rendered");
  }

  const updated = await prisma.marketingGraphic.findUniqueOrThrow({ where: { id: row.id } });
  return {
    id: updated.id,
    bookId: updated.bookId,
    template: updated.template as MarketingGraphicTemplate,
    width: updated.width,
    height: updated.height,
    headline: updated.headline,
    subhead: updated.subhead ?? undefined,
    callToAction: updated.callToAction ?? undefined,
    textColor: updated.textColor,
    backgroundColor: updated.backgroundColor,
    usedCover: updated.usedCover,
    storageKey: updated.storageKey ?? undefined,
    ready: updated.ready,
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * Assembles a sample chapter pack.
 *
 * The chapters are taken from the manuscript's own saved versions, so the
 * sample is exactly what the author chose and nothing more. The file is
 * rendered through the same renderer and the same validator the export path
 * uses, so a sample that would not open is refused rather than offered.
 */
export async function assembleSample(
  userId: string,
  bookId: string,
  input: SampleChapterInput,
): Promise<MarketingSample> {
  await getOwnedBook(userId, bookId);
  const format = input.format as SampleFormat;
  if (!SAMPLE_FORMATS.includes(format)) throw badRequest("That sample format is not supported.");

  // The limit is checked on the names as they arrived, before they are
  // deduplicated: a caller who names six chapters is asking for six, even if
  // two of them are the same chapter.
  if (input.chapterIds.length > MAX_SAMPLE_CHAPTERS) {
    throw badRequest(`A sample may contain at most ${MAX_SAMPLE_CHAPTERS} chapters.`);
  }
  const requested = [...new Set(input.chapterIds)];

  // Every named chapter must belong to this book and must be written, or the
  // sample would be assembled from a chapter that is not there.
  const chapters = await prisma.chapter.findMany({
    where: { bookId, id: { in: requested } },
    orderBy: { position: "asc" },
    select: { id: true, position: true, version: true, title: true, wordCount: true, status: true },
  });
  if (chapters.length !== requested.length) {
    throw notFound("One or more of the selected chapters are not part of this book.");
  }
  const unwritten = chapters.filter((c) => c.wordCount === 0 && c.status !== "done");
  if (unwritten.length) {
    throw badRequest(`"${unwritten[0].title}" has no content yet, so it cannot be part of a sample.`);
  }

  const row = await prisma.marketingSample.create({
    data: {
      userId,
      bookId,
      chapterIds: chapters.map((c) => c.id),
      format,
      chapterVersions: Object.fromEntries(chapters.map((c) => [c.id, c.version])) as object,
    },
  });

  try {
    const design = await designService.get(userId, bookId);
    const doc = await buildBookDocument(userId, bookId, { version: design.version, data: design.data }, {
      chapterIds: chapters.map((c) => c.id),
    });
    if (!doc.chapters.length) throw badRequest("None of the selected chapters could be rendered.");

    // The pinned image bytes are read from storage, so the sample carries
    // exactly the verified bytes rather than whatever is there now.
    const { images, cover } = await loadPinnedImages(userId, referencedAssetIds(doc), null);
    const rendered = await renderExport(
      { doc, design: design.data, images, cover, availableFonts: await fontRegistry.available(), rtl: doc.book.dir === "rtl" },
      parseExportOptions(format, undefined),
    );

    const key = `marketing/${userId}/${bookId}/${row.id}.${rendered.extension}`;
    await storage.put(key, rendered.buffer, rendered.contentType);

    // The file is read back from the path the download serves, then validated.
    const { stream } = await storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const stored = Buffer.concat(chunks);
    const validation = await validateExport({ format, buffer: stored, renderFacts: rendered.facts });
    if (!validation.passed) {
      await storage.remove(key).catch(() => undefined);
      const summary = validation.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join(" ");
      throw badRequest(`The sample did not validate, so it was not produced: ${summary}`);
    }

    await prisma.marketingSample.update({
      where: { id: row.id },
      data: { storageKey: key, ready: true },
    });
  } catch (err) {
    logger.warn({ err, sampleId: row.id }, "Sample chapter pack could not be assembled");
    const updated = await prisma.marketingSample.findUniqueOrThrow({ where: { id: row.id } });
    return toSample(updated, chapters.map((c) => c.title));
  }

  const updated = await prisma.marketingSample.findUniqueOrThrow({ where: { id: row.id } });
  return toSample(updated, chapters.map((c) => c.title));
}

/** A sample as the API returns it. */
function toSample(
  row: {
    id: string;
    bookId: string;
    chapterIds: unknown;
    format: string;
    storageKey: string | null;
    ready: boolean;
    createdAt: Date;
  },
  chapterTitles: string[],
): MarketingSample {
  return {
    id: row.id,
    bookId: row.bookId,
    chapterIds: Array.isArray(row.chapterIds) ? (row.chapterIds as string[]) : [],
    chapterTitles,
    format: row.format as SampleFormat,
    fileSize: 0,
    ready: row.ready,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The samples for a book. */
export async function listSamples(userId: string, bookId: string): Promise<MarketingSample[]> {
  await getOwnedBook(userId, bookId);
  const rows = await prisma.marketingSample.findMany({
    where: { userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Promise.all(
    rows.map(async (row) => {
      const ids = Array.isArray(row.chapterIds) ? (row.chapterIds as string[]) : [];
      const titles = await prisma.chapter.findMany({
        where: { id: { in: ids } },
        select: { title: true },
        orderBy: { position: "asc" },
      });
      return toSample(row, titles.map((t) => t.title));
    }),
  );
}

/**
 * The file for a sample, ready to download.
 *
 * The lookup is scoped to the owner, so one author cannot download another's
 * sample.
 */
export async function sampleForDownload(
  userId: string,
  sampleId: string,
): Promise<{ stream: NodeJS.ReadableStream; size: number; filename: string; contentType: string }> {
  const row = await prisma.marketingSample.findFirst({
    where: { id: sampleId, userId, book: { deletedAt: null } },
    include: { book: { select: { title: true } } },
  });
  if (!row) throw notFound("Sample");
  if (!row.ready || !row.storageKey) throw badRequest("This sample is not ready yet.");
  const { stream, size } = await storage.getStream(row.storageKey);
  const format = row.format as SampleFormat;
  return {
    stream,
    size: size ?? 0,
    filename: `${slugify(row.book.title)}-sample.${format}`,
    contentType: CONTENT_TYPES[format] ?? "application/octet-stream",
  };
}

/**
 * The rendered file for a promotional graphic, ready to download.
 *
 * The lookup is scoped to the owner, so one author cannot download another's
 * graphic. The graphic is the file the author made the graphic for, so it is
 * served the same way the sample packs are.
 */
export async function graphicForDownload(
  userId: string,
  graphicId: string,
): Promise<{ stream: NodeJS.ReadableStream; size: number; filename: string; contentType: string }> {
  const row = await prisma.marketingGraphic.findFirst({
    where: { id: graphicId, userId, book: { deletedAt: null } },
    include: { book: { select: { title: true } } },
  });
  if (!row) throw notFound("Graphic");
  if (!row.ready || !row.storageKey) throw badRequest("This graphic is not ready yet.");
  const { stream, size } = await storage.getStream(row.storageKey);
  return {
    stream,
    size: size ?? 0,
    filename: `${slugify(row.book.title)}-${row.template.replace(/_/g, "-")}.png`,
    contentType: "image/png",
  };
}

/** A filename-safe version of a title. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "book"
  );
}
