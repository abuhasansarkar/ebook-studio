import { INTERIOR_FONTS, TRIM_SIZES, chapterWord, languageScript, type FontId, type InteriorFont } from "@ebook/shared";
import type { PMNode } from "../editor/markdownToTiptap.js";
import type { BookDocument } from "../design/bookDocument.js";
import { documentStacks } from "../design/bookDocument.js";
import { escapeHtml, tiptapToHtml } from "./tiptapToHtml.js";

/**
 * One HTML renderer for every adapter. `print` produces fixed pages (trim, margins, running heads,
 * page numbers) for Chromium PDF output; `reader` produces reflowable HTML with no page concepts,
 * so print-only settings can never leak into a reflowable preview.
 */
export type RenderMode = "print" | "reader";
export interface RenderOptions {
  mode: RenderMode;
  /** URL for a static face file: the authenticated API route for previews, an intercepted origin for PDF export. */
  fontSrc: (faceId: string) => string;
  /** Image sources by asset id: data URIs for export, owner-authenticated URLs for previews. */
  images: Record<string, string>;
  available: ReadonlySet<string>;
  /** Include the front and back matter from the saved design. Defaults to true. */
  includeMatter?: boolean;
  /** Include the printed table of contents. Defaults to true. */
  includeToc?: boolean;
}
/** Fonts requested by PDF export resolve here and are answered from verified bytes by the renderer. */
export const EXPORT_FONT_ORIGIN = "https://fonts.ebook.invalid/";

const text = (s: string) => escapeHtml(s.normalize("NFC"));
/** CSS string literal safe inside <style>: escapes quotes, backslashes, newlines and angle brackets. */
export function cssString(s: string): string {
  return `"${s.normalize("NFC").replace(/[\\"<>\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}
const family = (stack: FontId[]) => [...new Set(stack.map((id) => `"${INTERIOR_FONTS[id].family}"`))].join(", ");
/** Plain multi-line matter text: blank lines separate paragraphs, single newlines are line breaks. */
function paragraphs(value: string, className = "") {
  return value.trim().split(/\n\s*\n/).map((p) => `<p${className ? ` class="${className}"` : ""}>${p.split("\n").map(text).join("<br />")}</p>`).join("");
}

const FACE_STYLE = { regular: "font-weight:400;font-style:normal", bold: "font-weight:700;font-style:normal", italic: "font-weight:400;font-style:italic", boldItalic: "font-weight:700;font-style:italic" } as const;
/** Static faces with exact weights; CSS only ever asks for 400/700, so Chromium never synthesizes bold. */
function fontFaces(stacks: FontId[][], options: RenderOptions) {
  return [...new Set(stacks.flat())].flatMap((id) => {
    const font: InteriorFont = INTERIOR_FONTS[id];
    return Object.entries(font.faces).map(([style, face]) => `@font-face{font-family:"${font.family}";src:url("${options.fontSrc(face)}") format("truetype");${FACE_STYLE[style as keyof typeof FACE_STYLE]};font-display:block}`);
  }).join("\n");
}

function printCss(doc: BookDocument, bodyFamily: string) {
  const p = doc.design.data.print;
  const trim = TRIM_SIZES[p.trim];
  const m = p.margins;
  const box = `font-family:${bodyFamily};font-size:8.5pt;color:#6b6460`;
  const title = cssString(doc.book.title);
  const author = cssString(doc.book.author || doc.book.title);
  const rules = [
    `@page{size:${trim.width}in ${trim.height}in;margin:${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in}`,
    p.mirrored ? `@page :left{margin-left:${m.outside}in;margin-right:${m.inside}in}@page :right{margin-left:${m.inside}in;margin-right:${m.outside}in}` : "",
    p.pageNumbers === "bottom-center" ? `@page{@bottom-center{content:counter(page);${box}}}` : "",
    p.pageNumbers === "bottom-outside" ? `@page :left{@bottom-left{content:counter(page);${box}}}@page :right{@bottom-right{content:counter(page);${box}}}` : "",
    p.header === "title" ? `@page{@top-center{content:${title};${box}}}` : "",
    p.header === "author-title" ? `@page :left{@top-center{content:${author};${box}}}@page :right{@top-center{content:${title};${box}}}` : "",
    // Named front-matter pages carry no running heads or folios (name outranks :left/:right).
    `@page front{${["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"].map((b) => `@${b}{content:none}`).join("")}}`,
  ];
  const pageHeight = trim.height - m.top - m.bottom;
  return `${rules.join("\n")}
  html{font-size:${p.fontSizePt}pt}
  .front{page:front}
  .front + .front,.chapter,.back{break-before:page}
  .title-page,.copyright,.dedication{height:${(pageHeight - 0.05).toFixed(2)}in}
  .chapter-opening{padding-top:${Math.min(1.2, pageHeight * 0.12).toFixed(2)}in}
  img{max-height:${Math.max(1.5, pageHeight - 1.2).toFixed(2)}in}
  tr,figure,pre{break-inside:avoid}
  h1,h2,h3,h4,.chapter-label{break-after:avoid}
  .table-wrap{overflow:visible}
  table{table-layout:fixed}
  thead{display:table-header-group}`;
}

function readerCss(doc: BookDocument) {
  const d = doc.design.data.digital;
  const width = { narrow: "32em", standard: "38em", wide: "46em" }[d.lineWidth];
  return `:root{--reader-scale:1}
  html{font-size:calc(${16 * d.fontScale}px * var(--reader-scale))}
  body{padding:2em 1.25em 4em}
  .book{max-width:${width};margin:0 auto}
  .front,.back{margin:0 0 3em}
  .title-page{padding:3em 0;text-align:center}
  .book-title{font-size:clamp(1.6em,9vw,2.5em)}
  h1,h2,.book-title{overflow-wrap:break-word}
  .chapter{margin:0 0 3em;padding-top:2.5em;border-top:1px solid #e7e1db}
  .table-wrap{overflow-x:auto}
  img{height:auto}`;
}

export function renderBookHtml(doc: BookDocument, options: RenderOptions): string {
  const { typography: t, elements: e, matter } = doc.design.data;
  const includeMatter = options.includeMatter !== false;
  const includeToc = options.includeToc !== false;
  const lang = doc.book.language;
  const stacks = documentStacks(doc, options.available);
  const body = family(stacks.body), heading = family(stacks.heading), mono = family(stacks.mono);
  const lineHeight = languageScript(lang) === "urdu" ? Math.max(t.lineHeight, 2) : t.lineHeight;
  const headingSize = { compact: [1.6, 1.3, 1.12], standard: [2, 1.35, 1.15], dramatic: [2.5, 1.4, 1.18] }[t.headingScale];
  const contents: { id: string; title: string }[] = doc.chapters.map((c, i) => ({ id: `chapter-${i + 1}`, title: c.title }));
  if (matter.aboutAuthor.enabled) contents.push({ id: "about-author", title: matter.aboutAuthor.title });
  if (matter.references.enabled) contents.push({ id: "references", title: matter.references.title });

  const front = [
    includeMatter && matter.titlePage ? `<section class="front title-page"><h1 class="book-title">${text(doc.book.title)}</h1>${doc.book.subtitle ? `<p class="subtitle">${text(doc.book.subtitle)}</p>` : ""}<div class="rule" aria-hidden="true"></div>${doc.book.author ? `<p class="author">${text(doc.book.author)}</p>` : ""}</section>` : "",
    includeMatter && matter.copyright.enabled ? `<section class="front copyright" aria-label="Copyright">${paragraphs(matter.copyright.text)}</section>` : "",
    includeMatter && matter.dedication.enabled ? `<section class="front dedication" aria-label="Dedication">${paragraphs(matter.dedication.text)}</section>` : "",
    includeMatter && includeToc && matter.contents.enabled && contents.length ? `<nav class="front toc" aria-labelledby="toc-title"><h2 id="toc-title">${text(matter.contents.title)}</h2><ol>${contents.map((c, i) => `<li><a href="#${c.id}">${i < doc.chapters.length ? `<span class="toc-num">${i + 1}</span>` : ""}<span>${text(c.title)}</span></a></li>`).join("")}</ol></nav>` : "",
  ].join("");
  const label = (n: number) => e.chapterLabel === "number" ? `<p class="chapter-label">${n}</p>` : e.chapterLabel === "word" ? `<p class="chapter-label">${text(chapterWord(lang, n))}</p>` : "";
  const chapters = doc.chapters.map((c, i) => `<section class="chapter" id="chapter-${i + 1}"><header class="chapter-opening">${label(i + 1)}<h1>${text(c.title)}</h1>${e.chapterOrnament === "rule" ? '<div class="ornament" aria-hidden="true"></div>' : ""}</header><div class="chapter-body">${tiptapToHtml(c.content as PMNode, options.images)}</div></section>`).join("");
  const back = [
    includeMatter && matter.aboutAuthor.enabled ? `<section class="back about" id="about-author"><h1>${text(matter.aboutAuthor.title)}</h1>${paragraphs(matter.aboutAuthor.text)}</section>` : "",
    includeMatter && matter.references.enabled ? `<section class="back references" id="references"><h1>${text(matter.references.title)}</h1>${matter.references.text.split(/\n+/).filter((l) => l.trim()).map((l) => `<p class="reference">${text(l.trim())}</p>`).join("")}</section>` : "",
  ].join("");

  const tableBorders = e.tableStyle === "grid" ? "th,td{border:1px solid #d9d2cc}th{background:#f6f1ec}" : "th,td{border:0;border-bottom:1px solid #ddd5ce}thead th{border-bottom:2px solid #8a817a}";
  const paragraphCss = t.paragraph === "indented" ? ".chapter-body p{margin:0}.chapter-body p+p{text-indent:1.5em}.chapter-body :is(ul,ol,blockquote,figure,.table-wrap,pre)+p{margin-top:.6em}" : ".chapter-body p{margin:0 0 .75em}";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${doc.book.dir}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; font-src 'self' ${EXPORT_FONT_ORIGIN}; style-src 'unsafe-inline'" />
<title>${text(doc.book.title)}</title>
<style>
${fontFaces([stacks.body, stacks.heading, stacks.mono], options)}
*{box-sizing:border-box}
html{background:#fff;-webkit-text-size-adjust:100%}
body{margin:0;font-family:${body};font-synthesis:style;color:#1d1a17;line-height:${lineHeight};text-align:start;font-kerning:normal;orphans:2;widows:2;${t.hyphenate ? "hyphens:auto;" : ""}}
:lang(zh),:lang(ja){line-break:strict;word-break:normal;overflow-wrap:anywhere}
:lang(ko){word-break:keep-all;overflow-wrap:anywhere}
h1,h2,h3,h4,.book-title,.chapter-label,.toc h2{font-family:${heading};line-height:1.25;hyphens:manual}
.title-page{display:flex;flex-direction:column;justify-content:center;text-align:center}
.book-title{font-size:2.5em;margin:0 0 .5em}
.subtitle{font-size:1.2em;color:#555;margin:0 0 2em}
.author{font-size:1.05em;letter-spacing:.04em}
.rule{width:60px;height:3px;background:${e.accent};margin:0 auto 1.5em}
.copyright{display:flex;flex-direction:column;justify-content:flex-end;font-size:.8em;color:#5d5752}
.dedication{display:flex;flex-direction:column;justify-content:center;text-align:center;font-style:italic}
.toc h2{font-size:1.6em;margin:0 0 1em}
.toc ol{list-style:none;padding:0;margin:0}
.toc li{margin:0 0 .55em}
.toc a{color:inherit;text-decoration:none;display:flex;gap:.8em}
.toc-num{color:${e.accent};font-weight:700;min-width:1.5em}
.chapter-label{color:${e.accent};font-weight:700;font-size:1.05em;margin:0 0 .4em}
.chapter-body,.back{text-align:${t.align === "justify" ? "justify" : "start"};text-align-last:start}
h1{font-size:${headingSize[0]}em;margin:0 0 1em}
.ornament{width:2.5em;height:2px;background:${e.accent};margin:-.4em 0 1.6em}
h2{font-size:${headingSize[1]}em;margin:1.5em 0 .5em}
h3{font-size:${headingSize[2]}em;margin:1.2em 0 .4em}
h4{font-size:1em;margin:1em 0 .3em}
${paragraphCss}
.back p{margin:0 0 .75em}
.reference{padding-inline-start:1.5em;text-indent:-1.5em;text-align:start}
ul,ol{margin:0 0 .9em;padding-inline-start:1.5em}
li{margin:0 0 .3em}
li>p{margin:0!important;text-indent:0!important}
blockquote{margin:1em 0;padding:.2em 1em;border-inline-start:3px solid ${e.accent};color:#444;font-style:italic}
pre{background:#f5f2ef;padding:.75em;font-size:.82em;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:4px;text-align:start}
code{font-family:${mono};font-size:.9em}
.table-wrap{margin:.9em 0 1.2em;max-width:100%}
table{width:100%;border-collapse:collapse;font-size:.86em;text-align:start}
th,td{padding:.35em .5em;vertical-align:top;text-align:start;overflow-wrap:anywhere}
${tableBorders}
td>p,th>p{margin:0!important;text-indent:0!important}
hr{border:0;border-top:1px solid #ddd;margin:1.5em 0}
figure{margin:1.2em 0;text-align:center}
img{max-width:${e.imageWidth === "medium" ? "70%" : "100%"}}
figcaption{font-size:.82em;color:#666;margin-top:.4em;text-align:${e.captionAlign === "center" ? "center" : "start"}}
a{color:#a7432a}
${options.mode === "print" ? printCss(doc, body) : readerCss(doc)}
</style>
</head>
<body class="mode-${options.mode}">
<main class="book">${front}${chapters}${back}</main>
</body>
</html>`;
}
