import { describe, expect, it } from "vitest";
import { countWords, markdownToTiptap, tiptapToText } from "../src/services/editor/markdownToTiptap.js";
import { tiptapToHtml } from "../src/services/exports/tiptapToHtml.js";
import { buildBookHtml } from "../src/services/exports/bookHtml.js";

describe("markdown → TipTap", () => {
  it("converts headings, lists, tables and marks", () => {
    const doc = markdownToTiptap("# Top\n\n## Section\n\nSome **bold** and *italic* [link](https://x.dev).\n\n- a\n- b\n\n1. one\n\n| H1 | H2 |\n|---|---|\n| c1 | c2 |\n\n> quote");
    const types = doc.content!.map((n) => n.type);
    expect(types).toEqual(["heading", "heading", "paragraph", "bulletList", "orderedList", "table", "blockquote"]);
    expect(doc.content![0].attrs).toEqual({ level: 2 }); // H1 reserved for chapter titles
    const marks = doc.content![2].content!.flatMap((n) => n.marks?.map((m) => m.type) ?? []);
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic", "link"]));
  });

  it("round-trips text", () => {
    expect(tiptapToText(markdownToTiptap("Hello **world**"))).toContain("Hello world");
  });
});

describe("countWords", () => {
  it("counts Latin, Bengali, Arabic and CJK", () => {
    expect(countWords("Hello there world")).toBe(3);
    expect(countWords("সপ্তাহের শুরুতে কিছু সময়")).toBe(4);
    expect(countWords("عندما تخصص بعض الوقت")).toBe(4);
    expect(countWords("作り置き")).toBe(4);
  });
});

describe("HTML rendering is safe", () => {
  it("escapes text and drops unsafe links", () => {
    const html = tiptapToHtml({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sets direction and language for RTL books", () => {
    const html = buildBookHtml({ title: "عنوان", subtitle: "", language: "ar", chapters: [{ title: "فصل", contentJson: { type: "doc", content: [] } }] });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain("Noto Naskh Arabic");
    expect(html).toContain("المحتويات");
  });
});
