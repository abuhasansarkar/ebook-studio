import type { BookDesign, DesignTemplate, SupportLevel } from '@ebook/shared';

export type SavedDesign = { version: number; data: BookDesign; action: string; detail: string; createdAt: string | null };
export type DesignVersionRow = { version: number; action: string; detail: string; createdAt: string };
export type LanguageCapability = { code: string; script: string; level: SupportLevel; notes: string[] };
export type Capabilities = { languages: LanguageCapability[]; fonts: { id: string; label: string; script: string; installed: boolean; optional: boolean; license: string }[]; limits: string[] };
export type GlyphFinding = { role: 'body' | 'heading'; count: number; characters: { char: string; codepoint: string }[] };
export type ReaderPreviewResult = {
  html: string;
  diagnostics: { support: LanguageCapability; glyphs: GlyphFinding[]; emptyChapters: number };
  design: { version: number; draft: boolean };
  chapters: { id: string; version: number; title: string }[];
};
/** What the preview panel renders: the working draft, a saved version, or a template before it is applied. */
export type PreviewSource = { kind: 'draft' } | { kind: 'version'; version: number } | { kind: 'template'; template: DesignTemplate };
