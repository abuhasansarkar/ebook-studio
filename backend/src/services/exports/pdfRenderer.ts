import puppeteer, { type Browser } from "puppeteer";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { FONT_FACE_IDS, INTERIOR_FONTS, TRIM_SIZES, type BookDesign } from "@ebook/shared";
import { fontRegistry, postscriptName } from "../design/fonts.js";
import { EXPORT_FONT_ORIGIN } from "./bookHtml.js";

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  browserPromise ??= puppeteer
    .launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
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
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
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
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const fontState = await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 30_000))]);
      const failed: string[] = [];
      document.fonts.forEach((face) => { if (face.status === "error") failed.push(face.family); });
      return { pending: document.fonts.status !== "loaded", failed };
    });
    if (fontState.pending) throw new Error("Bundled fonts did not finish loading in the PDF renderer");
    if (fontState.failed.length) throw new Error(`Bundled font failed to load: ${[...new Set(fontState.failed)].join(", ")}`);
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), { timeout: 15000 });
    if (!(await page.evaluate(() => Array.from(document.images).every((image) => image.naturalWidth > 0)))) throw new Error("An image failed to load in the PDF renderer");
    let overflow: string[] = [];
    if (options.textBlockWidthIn) {
      // Approximates the printed text block with print media at the same CSS width (96 px per inch).
      await page.emulateMediaType("print");
      await page.setViewport({ width: Math.round(options.textBlockWidthIn * 96), height: 1200 });
      overflow = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth + 1;
        const found: HTMLElement[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(".book *"))) {
          const rect = el.getBoundingClientRect();
          // Report the outermost overflowing element only, not each of its descendants.
          if (rect.width && (rect.right > limit || rect.left < -1) && !found.some((f) => f.contains(el))) found.push(el);
          if (found.length >= 5) break;
        }
        return found.map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 60)}`);
      });
    }
    const data = await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 120_000 });
    const buffer = Buffer.from(data);
    const { pageCount, fonts, type3 } = await inspectPdf(buffer);
    return { buffer, pageCount, foreignFonts: await foreignFonts(fonts), overflow, type3Fonts: type3 };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Never report success for a file we have not re-opened and checked. */
export async function validatePdf(buffer: Buffer): Promise<number> {
  return (await inspectPdf(buffer)).pageCount;
}

/**
 * Extracts the text layer of a PDF.
 *
 * Chromium's PDF viewer is used because it is the only PDF text extractor this
 * server has. The document is opened from a data URL with no network access, so
 * a PDF that references an external resource cannot reach the network.
 *
 * A PDF whose pages carry no text (a scan) yields an empty string, which the
 * caller reports as `scanned` rather than as an empty source.
 */
export async function extractPdfPageText(buffer: Buffer): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    // Nothing is loaded from the network: the PDF is inlined and every request is refused.
    page.on("request", (req) => void req.abort("blockedbyclient"));
    const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
    await page.goto(dataUrl, { waitUntil: "load", timeout: 60_000 });
    // Chromium's viewer renders the PDF into an embedded plugin; the text layer
    // is read back through the accessibility tree.
    await page.waitForFunction(() => document.querySelector('embed') !== null || document.body.innerText.length > 0, { timeout: 30_000 }).catch(() => undefined);
    const text = await page.evaluate(() => {
      const body = document.body?.innerText ?? '';
      return body.replace(/\r\n/g, '\n');
    });
    return text;
  } finally {
    await page.close().catch(() => undefined);
  }
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
