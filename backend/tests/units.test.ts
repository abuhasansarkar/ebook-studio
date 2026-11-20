import { documentError, publishingChecks } from "@ebook/shared";
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

describe('bounded editor documents', () => {
  it('accepts supported Markdown output and editor table defaults', () => {
    expect(documentError(markdownToTiptap('## Title\n\n**Bold** [link](https://example.com)\n\n- Item\n\n|A|B|\n|-|-|\n|C|D|'))).toBeNull();
    expect(documentError({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph' }] }] }] }] })).toBeNull();
  });
  it('rejects malformed children, executable links, unknown nodes and oversized nesting', () => {
    for (const node of [null, { type: 'text', text: 'root' }, { type: 'doc', content: {} }, { type: 'doc', content: [{ type: 'iframe' }] }, { type: 'doc', content: [{ type: 'text', text: 'no paragraph' }] }, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bad', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }]) expect(documentError(node)).not.toBeNull();
    let node: object = { type: 'paragraph' };
    for (let i = 0; i < 40; i++) node = { type: 'blockquote', content: [node] };
    expect(documentError({ type: 'doc', content: [node] })).toBe('Document is too complex');
  });
});

describe('marketplace preparation rules', () => {
  const input = { title: 'A useful book', authorName: 'Author', language: 'en', chapters: [{ wordCount: 300, status: 'done' }], files: [{ format: 'pdf', fileSize: 1000 }] };
  it('does not confuse application language support with Kindle eligibility', () => {
    const checks = publishingChecks({ ...input, destination: 'kdp_ebook', language: 'bn' });
    expect(checks.find(c => c.id === 'language')?.status).toBe('blocker');
    expect(checks.find(c => c.id === 'format')?.status).toBe('blocker');
    expect(publishingChecks({ ...input, destination: 'kdp_ebook', language: 'hi', files: [{ format: 'epub', fileSize: 1000 }] }).find(c => c.id === 'format')?.status).toBe('blocker');
  });
  it('checks Etsy delivery size, not total export history size', () => {
    const checks = publishingChecks({ ...input, destination: 'etsy', files: Array.from({ length: 12 }, () => ({ format: 'pdf', fileSize: 20000000 })) });
    expect(checks.find(c => c.id === 'file_size')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'file_count')?.status).toBe('review');
    expect(publishingChecks({ ...input, destination: 'etsy', files: [{ format: 'pdf', fileSize: 20000001 }] }).find(c => c.id === 'file_size')?.status).toBe('blocker');
  });
  it('keeps editorial review and exclusivity explicit even with valid files', () => {
    const checks = publishingChecks({ ...input, destination: 'gumroad' });
    expect(checks.find(c => c.id === 'format')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'exclusivity')?.status).toBe('review');
    expect(checks.find(c => c.id === 'proofreading')?.status).toBe('review');
  });
});
