import { getLanguage } from "@ebook/shared";
import type { PMNode } from "../editor/markdownToTiptap.js";
import { escapeHtml, tiptapToHtml } from "./tiptapToHtml.js";

export interface BookForExport {
  title: string;
  subtitle: string;
  authorName?: string;
  language: string;
  chapters: { title: string; contentJson: unknown }[];
}

/** Google Fonts family names for the language's primary font (falls back to system fonts offline). */
function fontFamiliesFor(languageCode: string): string[] {
  const primary = getLanguage(languageCode).fontFamily.match(/"([^"]+)"/)?.[1];
  return Array.from(new Set(["Noto Serif", "Noto Sans", primary].filter((f): f is string => Boolean(f))));
}

function googleFontsHref(families: string[]): string {
  const params = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=block`;
}

const CONTENTS_LABEL: Record<string, string> = {
  en: "Contents", zh: "目录", hi: "विषय-सूची", es: "Contenido", ar: "المحتويات", fr: "Table des matières",
  bn: "সূচিপত্র", pt: "Sumário", ru: "Содержание", ur: "فہرست", id: "Daftar Isi", de: "Inhalt", ja: "目次",
  tr: "İçindekiler", ko: "목차", vi: "Mục lục", it: "Indice", ta: "பொருளடக்கம்", fa: "فهرست مطالب", sw: "Yaliyomo",
};

export function buildBookHtml(book: BookForExport): string {
  const lang = getLanguage(book.language);
  const families = fontFamiliesFor(lang.code);
  const year = new Date().getFullYear();

  const toc = book.chapters
    .map((c, i) => `<li><a href="#chapter-${i + 1}"><span class="toc-num">${i + 1}</span>${escapeHtml(c.title)}</a></li>`)
    .join("");

  const chapters = book.chapters
    .map(
      (c, i) => `
      <section class="chapter" id="chapter-${i + 1}">
        <p class="chapter-label">${i + 1}</p>
        <h1>${escapeHtml(c.title)}</h1>
        ${tiptapToHtml(c.contentJson as PMNode)}
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang.code}" dir="${lang.dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(book.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${googleFontsHref(families)}" />
<style>
  @page {
    size: 6in 9in;
    margin: 0.8in 0.7in 0.85in 0.7in;
    @bottom-center { content: counter(page); font-family: ${lang.fontFamily}; font-size: 9pt; color: #777; }
  }
  @page :first { @bottom-center { content: none; } }
  @page front { @bottom-center { content: none; } }

  * { box-sizing: border-box; }
  html { font-size: 11pt; background: #fff; }
  body { margin: 0; font-family: ${lang.fontFamily}; color: #1d1a17; line-height: 1.6; text-align: start;
         -webkit-font-smoothing: antialiased; orphans: 3; widows: 3; hyphens: auto; }

  .title-page { page: front; height: 7.3in; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .title-page h1 { font-size: 28pt; line-height: 1.2; margin: 0 0 16pt; }
  .title-page .subtitle { font-size: 13pt; color: #555; margin: 0 0 40pt; }
  .title-page .author { font-size: 12pt; letter-spacing: 0.06em; text-transform: uppercase; }
  .title-page .rule { width: 60px; height: 3px; background: #e8603c; margin: 0 auto 24pt; }

  .copyright { page: front; break-before: page; height: 7.3in; display: flex; flex-direction: column; justify-content: flex-end; font-size: 8.5pt; color: #666; }

  .toc { page: front; break-before: page; }
  .toc h2 { font-size: 18pt; margin: 0 0 18pt; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { margin: 0 0 8pt; }
  .toc a { color: inherit; text-decoration: none; display: flex; gap: 10pt; }
  .toc-num { color: #e8603c; font-weight: 700; min-width: 18pt; }

  .chapter { break-before: page; }
  .chapter-label { color: #e8603c; font-weight: 700; font-size: 12pt; margin: 0.6in 0 6pt; }
  h1 { font-size: 22pt; line-height: 1.25; margin: 0 0 22pt; break-after: avoid; }
  h2 { font-size: 15pt; line-height: 1.3; margin: 22pt 0 8pt; break-after: avoid; }
  h3 { font-size: 12.5pt; margin: 16pt 0 6pt; break-after: avoid; }
  h4 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 9pt; }
  ul, ol { margin: 0 0 10pt; padding-inline-start: 18pt; }
  li { margin: 0 0 4pt; }
  li > p { margin: 0; }
  blockquote { margin: 12pt 0; padding: 4pt 12pt; border-inline-start: 3px solid #e8603c; color: #444; font-style: italic; }
  pre { background: #f5f2ef; padding: 8pt; font-size: 9pt; white-space: pre-wrap; border-radius: 4px; break-inside: avoid; }
  code { font-family: "Noto Sans Mono", Menlo, monospace; font-size: 0.9em; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0 14pt; font-size: 9.5pt; break-inside: avoid; }
  th, td { border: 1px solid #d9d2cc; padding: 5pt 6pt; text-align: start; vertical-align: top; }
  th { background: #f7efe9; }
  td > p, th > p { margin: 0; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 16pt 0; }
  figure { margin: 12pt 0; text-align: center; break-inside: avoid; }
  img { max-width: 100%; }
  figcaption { font-size: 9pt; color: #666; }
  a { color: #b9472a; }
  .page-break { break-after: page; }
</style>
</head>
<body>
  <section class="title-page">
    <h1>${escapeHtml(book.title)}</h1>
    ${book.subtitle ? `<p class="subtitle">${escapeHtml(book.subtitle)}</p>` : ""}
    <div class="rule"></div>
    ${book.authorName ? `<p class="author">${escapeHtml(book.authorName)}</p>` : ""}
  </section>
  <section class="copyright">
    <p>© ${year}${book.authorName ? ` ${escapeHtml(book.authorName)}` : ""}</p>
    ${lang.code === "en" ? "<p>All rights reserved. No part of this publication may be reproduced without permission, except for brief quotations in reviews.</p>" : ""}
  </section>
  <nav class="toc">
    <h2>${CONTENTS_LABEL[lang.code] ?? "Contents"}</h2>
    <ol>${toc}</ol>
  </nav>
  ${chapters}
</body>
</html>`;
}
