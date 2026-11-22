import puppeteer, { type Browser, type Page } from "puppeteer";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { FONT_FACE_IDS, INTERIOR_FONTS, TRIM_SIZES, type BookDesign } from "@ebook/shared";
import { fontRegistry, postscriptName } from "../design/fonts.js";
import { EXPORT_FONT_ORIGIN } from "./bookHtml.js";

let browserPromise: Promise<Browser> | null = null;

/**
 * Chromium's sandbox stays on unless the operator opts out.
 *
 * Some container runtimes (Docker's default seccomp profile with a non-root
 * user) cannot create the namespaces the sandbox needs. Those deployments set
 * `CHROMIUM_NO_SANDBOX=1` explicitly; it is never the silent default.
 */
export function chromiumArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const args = ["--disable-dev-shm-usage", "--font-render-hinting=none"];
  if (/^(1|true|yes)$/i.test(env.CHROMIUM_NO_SANDBOX ?? "")) args.unshift("--no-sandbox");
  return args;
}

export function getBrowser(): Promise<Browser> {
  browserPromise ??= puppeteer
    .launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: chromiumArgs(),
    })
    .then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
      return b;
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });
  return browserPromise;
}

/** A counting semaphore: at most `limit` holders at once, the rest wait in FIFO order. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(readonly limit: number) {}
  get inUse() { return this.active; }
  get queued() { return this.waiting.length; }
  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      // The slot passes straight to the next waiter, so the count never dips below the true holders.
      if (next) next();
      else this.active--;
    };
  }
  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try { return await task(); } finally { release(); }
  }
}

/** Every Chromium tab this process opens for rendering goes through this cap. */
export const renderSlots = new Semaphore(Math.max(1, Number(process.env.CHROMIUM_MAX_PAGES) || 4));

/** Rejects after `ms` with a clear message; the caller's `finally` closes the page. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Opens one tab under the render cap and always closes it.
 *
 * Content scripts are disabled by default: book HTML is data, never code.
 * `page.evaluate` still runs, because DevTools evaluation is not page script.
 * Other Chromium users (covers, marketing graphics) should open their tabs here
 * too, so the per-process cap covers every tab.
 */
export async function withBrowserPage<T>(task: (page: Page) => Promise<T>, options: { javascript?: boolean } = {}): Promise<T> {
  return renderSlots.run(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      if (!options.javascript) await page.setJavaScriptEnabled(false);
      return await task(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  });
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close();
}

export function textBlockWidth(design: BookDesign) {
  return TRIM_SIZES[design.print.trim].width - design.print.margins.inside - design.print.margins.outside;
}

export interface RenderedPdf {
  buffer: Buffer;
  pageCount: number;
  /** PostScript names of embedded fonts that are not bundled (Chromium fell back to a system font). */
  foreignFonts: string[];
  /** Elements wider than the printed text block (they would be clipped at the page edge). */
  overflow: string[];
  /** Type 3 fonts (outline-converted glyphs, e.g. synthesized bold): poorly supported by print preflight. */
  type3Fonts: string[];
}

/**
 * Renders print-mode book HTML with Chromium (HarfBuzz shaping for Bengali, Devanagari, Arabic, CJK…).
 * Fonts are answered from manifest-verified bytes; every other network request is blocked.
 */
export async function renderPdf(html: string, options: { textBlockWidthIn?: number } = {}): Promise<RenderedPdf> {
  return withBrowserPage(async (page) => {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:")) return void req.continue();
      const id = url.startsWith(EXPORT_FONT_ORIGIN) ? url.slice(EXPORT_FONT_ORIGIN.length) : "";
      if (!FONT_FACE_IDS.includes(id)) return void req.abort("blockedbyclient");
      fontRegistry.bytes(id).then(
        // Fonts are fetched in CORS mode from the about:blank document, so the response must allow it.
        (body) => req.respond({ status: 200, contentType: "font/ttf", headers: { "Access-Control-Allow-Origin": "*" }, body }),
        () => req.abort("failed"),
      );
    });
    await withTimeout(page.setContent(html, { waitUntil: "load", timeout: 60_000 }), 65_000, "Loading the book into the PDF renderer");
    // The wait for fonts is bounded here, in Node: page timers do not run while content scripts are disabled.
    const fontState = await withTimeout(page.evaluate(async () => {
      await document.fonts.ready;
      const failed: string[] = [];
      // Iterated rather than forEach'd: native code may not call back into script while scripts are disabled.
      for (const face of Array.from(document.fonts as unknown as Iterable<FontFace>)) if (face.status === "error") failed.push(face.family);
      return { pending: document.fonts.status !== "loaded", failed };
    }), 30_000, "Loading the bundled fonts");
    if (fontState.pending) throw new Error("Bundled fonts did not finish loading in the PDF renderer");
    if (fontState.failed.length) throw new Error(`Bundled font failed to load: ${[...new Set(fontState.failed)].join(", ")}`);
    // Images are inlined data URLs, so the load event has already fetched them; decoding proves they are usable.
    const imagesOk = await withTimeout(page.evaluate(async () => {
      const images = Array.from(document.images);
      for (const image of images) {
        try { await image.decode(); } catch { return false; }
      }
      return images.every((image) => image.complete && image.naturalWidth > 0);
    }), 15_000, "Loading the images");
    if (!imagesOk) throw new Error("An image failed to load in the PDF renderer");
    let overflow: string[] = [];
    if (options.textBlockWidthIn) {
      // Approximates the printed text block with print media at the same CSS width (96 px per inch).
      await page.emulateMediaType("print");
      await page.setViewport({ width: Math.round(options.textBlockWidthIn * 96), height: 1200 });
      overflow = await withTimeout(page.evaluate(() => {
        const limit = document.documentElement.clientWidth + 1;
        const found: HTMLElement[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(".book *"))) {
          const rect = el.getBoundingClientRect();
          // Report the outermost overflowing element only, not each of its descendants.
          if (rect.width && (rect.right > limit || rect.left < -1) && !found.some((f) => f.contains(el))) found.push(el);
          if (found.length >= 5) break;
        }
        return found.map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 60)}`);
      }), 30_000, "Checking the layout");
    }
    const data = await withTimeout(page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 120_000 }), 125_000, "Printing the PDF");
    const buffer = Buffer.from(data);
    const { pageCount, fonts, type3 } = await inspectPdf(buffer);
    return { buffer, pageCount, foreignFonts: await foreignFonts(fonts), overflow, type3Fonts: type3 };
  });
}

/** Never report success for a file we have not re-opened and checked. */
export async function validatePdf(buffer: Buffer): Promise<number> {
  return (await inspectPdf(buffer)).pageCount;
}

async function inspectPdf(buffer: Buffer) {
  if (buffer.length < 1024) throw new Error("Generated PDF is unexpectedly small");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Generated file is not a PDF");
  const doc = await PDFDocument.load(buffer, { updateMetadata: false });
  const pageCount = doc.getPageCount();
  if (pageCount < 1) throw new Error("Generated PDF has no pages");
  const fonts = new Set<string>(), type3 = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    // Type 0/TrueType fonts carry BaseFont; Chromium's Type 3 fonts only name themselves in the descriptor.
    const descriptor = object.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    const raw = object.get(PDFName.of("BaseFont")) ?? descriptor?.get(PDFName.of("FontName"));
    const name = raw instanceof PDFName ? raw.decodeText().replace(/^[A-Z]{6}\+/, "") : "(unnamed)";
    fonts.add(name);
    if (object.get(PDFName.of("Subtype")) === PDFName.of("Type3")) type3.add(name);
  }
  return { pageCount, fonts: [...fonts], type3: [...type3].sort() };
}

let bundledFamilies: Promise<Set<string>> | null = null;
/** "NotoSansSC-Bold" → "NotoSansSC". */
const familyKey = (name: string) => name.split("-")[0];
async function foreignFonts(embedded: string[]) {
  bundledFamilies ??= (async () => {
    const available = await fontRegistry.available();
    const faces = [...available].flatMap((id) => Object.values(INTERIOR_FONTS[id].faces) as string[]);
    const names = await Promise.all(faces.map(async (face) => familyKey(postscriptName(await fontRegistry.bytes(face)))));
    return new Set(names.filter(Boolean));
  })().catch((error) => { bundledFamilies = null; throw error; });
  const bundled = await bundledFamilies;
  return embedded.filter((name) => !bundled.has(familyKey(name))).sort();
}
