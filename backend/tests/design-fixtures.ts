import { defaultBookDesign, getLanguage, type BookDesign } from "@ebook/shared";
import type { BookDocument } from "../src/services/design/bookDocument.js";

/** In-memory normalized document for renderer tests that do not need the database. */
export function testDocument(input: { title?: string; subtitle?: string; author?: string; language?: string; design?: BookDesign; chapters: { title: string; content: unknown }[] }): BookDocument {
  const language = getLanguage(input.language ?? "en");
  return {
    book: { id: "book", title: input.title ?? "Test", subtitle: input.subtitle ?? "", author: input.author ?? "", language: language.code, dir: language.dir },
    design: { version: 0, data: input.design ?? defaultBookDesign(language.code, input.author ?? "", 2026) },
    chapters: input.chapters.map((c, i) => ({ id: `c${i}`, position: i, version: 1, title: c.title, content: c.content })),
    partial: false,
  };
}
