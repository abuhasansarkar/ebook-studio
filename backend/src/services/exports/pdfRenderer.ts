import puppeteer, { type Browser } from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { logger } from "../../utils/logger.js";

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

export interface RenderedPdf {
  buffer: Buffer;
  pageCount: number;
}

/** Renders HTML to PDF with Chromium (correct shaping for Bengali, Devanagari, Arabic, CJK…). */
export async function renderPdf(html: string): Promise<RenderedPdf> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    try {
      await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
      // Wait for web fonts (bounded, so an offline renderer still completes with local fonts).
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 20_000))]));
    } catch (err) {
      logger.warn({ err }, "Font loading timed out; rendering with local fonts");
    }
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete), { timeout: 15000 });
    if (!await page.evaluate(() => Array.from(document.images).every(image => image.naturalWidth > 0))) throw new Error('An image failed to load in the PDF renderer');
    const data = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      outline: true,
      tagged: true,
      timeout: 120_000,
    });
    const buffer = Buffer.from(data);
    const pageCount = await validatePdf(buffer);
    return { buffer, pageCount };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Never report success for a file we have not re-opened and checked. */
export async function validatePdf(buffer: Buffer): Promise<number> {
  if (buffer.length < 1024) throw new Error("Generated PDF is unexpectedly small");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Generated file is not a PDF");
  const doc = await PDFDocument.load(buffer, { updateMetadata: false });
  const pages = doc.getPageCount();
  if (pages < 1) throw new Error("Generated PDF has no pages");
  return pages;
}
