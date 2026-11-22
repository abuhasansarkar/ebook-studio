import { renderSlots, withTimeout } from '../exports/pdfRenderer.js';

/** Upper bounds for one extraction; a source is capped at far fewer characters anyway. */
export const PDF_TEXT_LIMITS = { timeoutMs: 30_000, maxPages: 2000, maxCharacters: 2_000_000 };

interface TextItem { str?: string; hasEOL?: boolean }

/**
 * Extracts the text layer of a PDF with pdf.js.
 *
 * The parser runs without font loading, scripting (XFA) or any network or
 * file access: the bytes are the whole input. Extraction shares the
 * renderer's concurrency cap and is bounded in time, pages and characters.
 * A PDF whose pages carry no text (a scan) yields an empty string, which the
 * caller reports as `scanned` rather than as an empty source.
 */
export async function extractPdfPageText(buffer: Buffer, limits: Partial<Readonly<typeof PDF_TEXT_LIMITS>> = {}): Promise<string> {
  const { timeoutMs, maxPages, maxCharacters } = { ...PDF_TEXT_LIMITS, ...limits };
  return renderSlots.run(async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      // pdf.js takes ownership of (and may detach) the array it is given.
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      enableXfa: false,
      stopAtErrors: false,
      verbosity: 0,
    });
    let cancelled = false;
    const extract = async () => {
      const doc = await task.promise;
      const pages: string[] = [];
      let characters = 0;
      for (let number = 1; number <= Math.min(doc.numPages, maxPages) && !cancelled; number++) {
        const page = await doc.getPage(number);
        const content = await page.getTextContent();
        let text = '';
        for (const item of content.items as TextItem[]) {
          text += item.str ?? '';
          if (item.hasEOL) text += '\n';
        }
        page.cleanup();
        pages.push(text.replace(/\r\n?/g, '\n').trim());
        characters += text.length;
        if (characters >= maxCharacters) break;
      }
      // Pages are separated by a blank line so each page starts a new passage.
      return pages.filter(Boolean).join('\n\n');
    };
    try {
      return await withTimeout(extract(), timeoutMs, 'Reading the PDF text');
    } finally {
      cancelled = true;
      await task.destroy().catch(() => undefined);
    }
  });
}
