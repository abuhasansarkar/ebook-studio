import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { chromiumArgs, closeBrowser, renderPdf, renderSlots, Semaphore } from '../src/services/exports/pdfRenderer.js';
import { extractPdfPageText } from '../src/services/sources/pdfText.js';
import { extractPdf } from '../src/services/sources/extractors.js';

afterAll(() => closeBrowser());

async function textPdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = pdf.addPage([595, 842]);
    page.drawText(line, { x: 50, y: 780, size: 14, font });
  }
  return Buffer.from(await pdf.save());
}

describe('PDF text extraction', () => {
  it('reads the text layer of a real text PDF, one page per block', async () => {
    const text = await extractPdfPageText(await textPdf(['Batch cooking saves time on busy weeknights.', 'Freezing keeps food safe.']));
    expect(text).toBe('Batch cooking saves time on busy weeknights.\n\nFreezing keeps food safe.');
  });

  it('reads a PDF printed by the export renderer and imports it as a ready source', async () => {
    const rendered = await renderPdf('<!doctype html><html><body><h1>Meal planning</h1><p>Chop the onions on Sunday evening.</p></body></html>');
    const text = await extractPdfPageText(rendered.buffer);
    expect(text).toContain('Meal planning');
    expect(text).toContain('Chop the onions on Sunday evening.');
    const result = await extractPdf(rendered.buffer);
    expect(result.status).toBe('ready');
    expect(result.passages.map((p) => p.text).join(' ')).toContain('Chop the onions');
  });

  it('reports a PDF with no text layer as scanned', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
    expect((await extractPdf(Buffer.from(await pdf.save()))).status).toBe('scanned');
  });

  it('gives up on an extraction that exceeds its time budget', async () => {
    const big = await textPdf(Array.from({ length: 300 }, (_, i) => `Page ${i} of a long report.`));
    await expect(extractPdfPageText(big, { timeoutMs: 1 })).rejects.toThrow(/timed out/);
    // The slot is released after a timeout.
    expect(renderSlots.inUse).toBe(0);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(extractPdfPageText(Buffer.from('%PDF-1.7 garbage that is not a pdf'))).rejects.toThrow();
    expect(renderSlots.inUse).toBe(0);
  });
});

describe('Chromium hardening', () => {
  it('keeps the sandbox unless the operator opts out explicitly', () => {
    expect(chromiumArgs({})).not.toContain('--no-sandbox');
    expect(chromiumArgs({ CHROMIUM_NO_SANDBOX: '0' })).not.toContain('--no-sandbox');
    expect(chromiumArgs({ CHROMIUM_NO_SANDBOX: '1' })).toContain('--no-sandbox');
  });

  it('never runs scripts embedded in the book HTML', async () => {
    const rendered = await renderPdf('<!doctype html><html><body><p id="x">Static text only.</p><script>document.getElementById("x").textContent = "SCRIPT RAN";</script></body></html>');
    const text = await extractPdfPageText(rendered.buffer);
    expect(text).toContain('Static text only.');
    expect(text).not.toContain('SCRIPT RAN');
  });

  it('still checks images with scripts disabled', async () => {
    const png = (await sharp({ create: { width: 4, height: 4, channels: 3, background: '#c33' } }).png().toBuffer()).toString('base64');
    const ok = await renderPdf(`<!doctype html><html><body><p>Picture</p><img src="data:image/png;base64,${png}" alt=""></body></html>`);
    expect(ok.pageCount).toBe(1);
    await expect(renderPdf('<!doctype html><html><body><img src="data:image/png;base64,AAAA" alt=""></body></html>')).rejects.toThrow(/image failed to load/);
    expect(renderSlots.inUse).toBe(0);
  });

  it('caps concurrent work at the semaphore limit, in FIFO order', async () => {
    const gate = new Semaphore(2);
    let active = 0, peak = 0;
    const order: number[] = [];
    await Promise.all(Array.from({ length: 6 }, (_, i) => gate.run(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(i);
      active--;
    })));
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gate.inUse).toBe(0);
  });

  it('caps concurrent renders across the process', async () => {
    const html = '<!doctype html><html><body><p>Concurrent render.</p></body></html>';
    let peak = 0;
    const watch = setInterval(() => { peak = Math.max(peak, renderSlots.inUse); }, 1);
    try {
      await Promise.all(Array.from({ length: renderSlots.limit + 2 }, () => renderPdf(html)));
    } finally { clearInterval(watch); }
    expect(peak).toBeLessThanOrEqual(renderSlots.limit);
    expect(renderSlots.inUse).toBe(0);
  });
});
