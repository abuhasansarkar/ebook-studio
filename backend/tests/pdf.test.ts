import { afterAll, describe, expect, it } from "vitest";
import { TRIM_SIZES, applyTemplate, defaultBookDesign, findTemplate } from "@ebook/shared";
import { PDFDocument } from "pdf-lib";
import { EXPORT_FONT_ORIGIN, renderBookHtml } from "../src/services/exports/bookHtml.js";
import { markdownToTiptap } from "../src/services/editor/markdownToTiptap.js";
import { closeBrowser, renderPdf, textBlockWidth, validatePdf } from "../src/services/exports/pdfRenderer.js";
import { documentDiagnostics } from "../src/services/design/bookDocument.js";
import { fontRegistry } from "../src/services/design/fonts.js";
import { testDocument } from "./design-fixtures.js";

afterAll(() => closeBrowser());

/** S08 language fixtures. Each must shape with bundled fonts only: no system fallback, no clipped content. */
const SAMPLES: Record<string, { md: string; font: string }> = {
  en: { md: "## Why plan ahead\n\nA little time on Sunday makes the *whole week* easier. A quoted Arabic phrase: «مرحبا بالعالم» and Bengali «বাংলা».", font: "NotoSerif" },
  bn: { md: "## কেন আগে থেকে রান্না করবেন\n\nযুক্তাক্ষর পরীক্ষা: ক্ষ, জ্ঞ, ন্ত্র, স্ক্র, শ্রী। Mixed English words inside Bengali: Meal prep ২০২৬।\n\nNukta forms: য়, ড়, ঢ়.", font: "NotoSerifBengali" },
  ar: { md: "## لماذا التحضير المسبق؟\n\nعندما تخصص بعض الوقت في بداية الأسبوع، يصبح الأسبوع كله أسهل. كلمة English داخل النص و 2026 رقم.", font: "NotoNaskhArabic" },
  ur: { md: "## پہلے سے تیاری کیوں؟\n\nہفتے کے آغاز میں تھوڑا سا وقت پورے ہفتے کو آسان بنا دیتا ہے۔", font: "NotoNastaliqUrdu" },
  hi: { md: "## पहले से योजना क्यों\n\nसप्ताह की शुरुआत में थोड़ा समय पूरे सप्ताह को आसान बना देता है। क्षत्रिय, श्री।", font: "NotoSerifDevanagari" },
  ta: { md: "## ஏன் முன்கூட்டியே திட்டமிட வேண்டும்\n\nவாரத்தின் தொடக்கத்தில் சிறிது நேரம் செலவிடுவது முழு வாரத்தையும் எளிதாக்குகிறது.", font: "NotoSerifTamil" },
  zh: { md: "## 为什么要提前准备\n\n" + "在一周开始时花一点时间，整个星期都会轻松得多。".repeat(12), font: "NotoSansSC" },
  ja: { md: "## なぜ作り置きをするのか\n\n" + "週の初めに少し時間を使うだけで、一週間がずっと楽になります。".repeat(12), font: "NotoSansJP" },
  ko: { md: "## 왜 미리 준비해야 할까요\n\n" + "한 주를 시작할 때 조금만 시간을 들이면 일주일 내내 훨씬 편해집니다. ".repeat(8), font: "NotoSansKR" },
};

async function render(doc: ReturnType<typeof testDocument>) {
  const available = await fontRegistry.available();
  const html = renderBookHtml(doc, { mode: "print", fontSrc: (face: string) => EXPORT_FONT_ORIGIN + face, images: {}, available });
  return renderPdf(html, { textBlockWidthIn: textBlockWidth(doc.design.data) });
}
async function embeddedFonts(buffer: Buffer) {
  const { PDFDict, PDFName } = await import("pdf-lib");
  const doc = await PDFDocument.load(buffer);
  const names = new Set<string>();
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Font")) { const n = o.get(PDFName.of("BaseFont")) ?? o.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict)?.get(PDFName.of("FontName")); if (n instanceof PDFName) names.add(n.decodeText().replace(/^[A-Z]{6}\+/, "")); }
  }
  return [...names];
}

describe("PDF export language fixtures", () => {
  for (const [lang, sample] of Object.entries(SAMPLES)) {
    it(`renders ${lang} with bundled fonts only`, async () => {
      const doc = testDocument({ title: "Test", subtitle: "Sub", author: "Author", language: lang, chapters: [{ title: "One", content: markdownToTiptap(sample.md) }] });
      const diagnostics = await documentDiagnostics(doc);
      expect(diagnostics.support.level).not.toBe("unavailable");
      expect(diagnostics.glyphs).toEqual([]);
      const { buffer, pageCount, foreignFonts, overflow, type3Fonts } = await render(doc);
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pageCount).toBeGreaterThanOrEqual(4); // title, copyright, contents, chapter
      expect(foreignFonts).toEqual([]);
      expect(type3Fonts).toEqual([]);
      expect(overflow).toEqual([]);
      expect((await embeddedFonts(buffer)).some((name) => name.startsWith(sample.font))).toBe(true);
    });
  }

  it("splits a long table across pages without clipping wide cells", async () => {
    const rows = Array.from({ length: 90 }, (_, i) => `| Item ${i + 1} | ${"A long description that needs wrapping ".repeat(2)} | https://example.com/${"x".repeat(80)} |`).join("\n");
    const doc = testDocument({ chapters: [{ title: "Reference table", content: markdownToTiptap(`| Name | Description | Link |\n|---|---|---|\n${rows}`) }] });
    const html = renderBookHtml(doc, { mode: "print", fontSrc: (id) => EXPORT_FONT_ORIGIN + id, images: {}, available: await fontRegistry.available() });
    expect(html).toContain("<thead><tr><th><p>Name</p></th>");
    const { pageCount, overflow, foreignFonts, type3Fonts } = await render(doc);
    expect(pageCount).toBeGreaterThanOrEqual(7);
    expect(type3Fonts).toEqual([]);
    expect(overflow).toEqual([]);
    expect(foreignFonts).toEqual([]);
  });

  it("applies the saved trim size and reports glyphs that no approved font covers", async () => {
    const design = applyTemplate(defaultBookDesign("en", "", 2026), findTemplate("classic", 1)!);
    const doc = testDocument({ design, chapters: [{ title: "Thai", content: markdownToTiptap("English with Thai: สวัสดีครับ") }] });
    const diagnostics = await documentDiagnostics(doc);
    expect(diagnostics.glyphs[0]?.characters.map((c) => c.char)).toContain("ส");
    const { buffer } = await render(doc);
    const page = (await PDFDocument.load(buffer)).getPage(0).getSize();
    expect(Math.round(page.width)).toBe(TRIM_SIZES["5.5x8.5"].width * 72);
    expect(Math.round(page.height)).toBe(TRIM_SIZES["5.5x8.5"].height * 72);
  });

  it("rejects files that are not PDFs", async () => {
    await expect(validatePdf(Buffer.alloc(2048, 1))).rejects.toThrow();
  });
});
