import { describe, expect, it } from "vitest";
import { tiptapToHtml } from "../src/services/exports/tiptapToHtml.js";
import { runRuleChecks } from "../src/services/quality/checks.js";
import { buildZip } from "../src/services/exports/zip.js";
import { extractDocx } from "../src/services/sources/extractors.js";

describe("audit regression checks", () => {
  it("escapes CTA button href attributes in tiptapToHtml", () => {
    const html = tiptapToHtml(
      {
        type: "doc",
        content: [
          {
            type: "cta",
            attrs: {
              buttonText: "Buy Now",
              buttonUrl: 'https://example.com/?a=1" onclick="alert(1)',
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Get the book" }] }],
          },
        ],
      },
      {},
    );
    expect(html).not.toContain('" onclick="');
    expect(html).toContain("&quot;");
  });

  it("computes contradiction and definition-conflict anchors relative to block.text", () => {
    const p1 = "This is an intro sentence. The engine weighs 50 kg in production.";
    const p2 = "Another chapter opens here. The engine weighs 75 kg in production.";
    const p3 = "Context matters here. Widget means a tiny plastic gear for clocks.";
    const result = runRuleChecks({
      title: "Test",
      subtitle: "",
      author: "Author",
      language: "en",
      referencesEnabled: false,
      uncoveredCharacters: new Set<string>(),
      readyAssets: new Set(),
      context: {
        voice: "",
        terms: [],
        definitions: [{ term: "Widget", definition: "A software UI component", note: "" }],
      },
      chapters: [
        {
          id: "c1",
          position: 0,
          version: 1,
          title: "One",
          wordCount: 12,
          targetWords: 100,
          content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: p1 }] }] },
        },
        {
          id: "c2",
          position: 1,
          version: 1,
          title: "Two",
          wordCount: 24,
          targetWords: 100,
          content: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: p2 }] },
              { type: "paragraph", content: [{ type: "text", text: p3 }] },
            ],
          },
        },
      ],
    });

    const contradiction = result.findings.find((f) => f.ruleId === "contradiction.value");
    expect(contradiction?.anchor?.quote).toBe("75 kg");
    expect(contradiction?.anchor?.start).toBe(p2.indexOf("75 kg"));

    const defConflict = result.findings.find((f) => f.ruleId === "contradiction.definition");
    expect(defConflict?.anchor?.quote).toContain("Widget means");
    expect(defConflict?.anchor?.start).toBe(p3.indexOf("Widget means"));
  });

  it("handles out-of-range numeric XML entities in extractDocx without throwing RangeError", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Test &#99999999; &#xFFFFFFFF; ok</w:t></w:r></w:p></w:body></w:document>`;
    const docx = buildZip([{ name: "word/document.xml", data: Buffer.from(xml, "utf8") }]);
    const extracted = extractDocx(docx);
    const fullText = extracted.passages.map((p) => p.text).join("\n");
    expect(fullText).toContain("Test");
    expect(fullText).toContain("ok");
  });
});
