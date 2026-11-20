import { afterAll, describe, expect, it } from "vitest";
import { buildBookHtml } from "../src/services/exports/bookHtml.js";
import { markdownToTiptap } from "../src/services/editor/markdownToTiptap.js";
import { closeBrowser, renderPdf, validatePdf } from "../src/services/exports/pdfRenderer.js";

afterAll(() => closeBrowser());

const SAMPLES: Record<string, string> = {
  en: "## Why plan ahead\n\nA little time on Sunday makes the whole week easier.",
  bn: "## কেন আগে থেকে রান্না করবেন\n\nযুক্তাক্ষর পরীক্ষা: ক্ষ, জ্ঞ, ন্ত্র, স্ক্র, শ্রী।",
  ar: "## لماذا التحضير المسبق؟\n\nعندما تخصص بعض الوقت في بداية الأسبوع، يصبح الأسبوع كله أسهل.",
  ja: "## なぜ作り置きをするのか\n\n週の初めに少し時間を使うだけで、一週間がずっと楽になります。",
};

describe("PDF export", () => {
  for (const [lang, md] of Object.entries(SAMPLES)) {
    it(`renders a valid PDF for ${lang}`, async () => {
      const html = buildBookHtml({ title: "Test", subtitle: "Sub", authorName: "Author", language: lang, chapters: [{ title: "One", contentJson: markdownToTiptap(md) }] });
      const { buffer, pageCount } = await renderPdf(html);
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pageCount).toBeGreaterThanOrEqual(4); // title, copyright, contents, chapter
    });
  }

  it("rejects files that are not PDFs", async () => {
    await expect(validatePdf(Buffer.alloc(2048, 1))).rejects.toThrow();
  });
});
