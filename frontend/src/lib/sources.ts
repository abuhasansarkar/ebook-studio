"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterSourceLink,
  EvidencePassage,
  ExtractedPassage,
  ExtractionState,
  ExtractionWarning,
  SourceAnswer,
  SourceFormat,
  SourceSummary,
} from "@ebook/shared";
import { api, errorMessage } from "./api";

/**
 * S11 research sources.
 *
 * A source is the author's own document. The API never writes imported text into
 * the manuscript until the author confirms a preview, so every mutation here is
 * either a review action (preview, confirm) or a read.
 */

/** A source as the list view shows it. */
export interface SourceRow {
  id: string;
  bookId: string;
  title: string;
  format: SourceFormat;
  provenance: string;
  license: string;
  version: number;
  status: ExtractionState;
  bytes: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { links: number };
}

/** One immutable extraction of a source. */
export interface SourceVersionRow {
  id: string;
  sourceId: string;
  version: number;
  format: SourceFormat;
  sha256: string;
  bytes: number;
  status: ExtractionState;
  passageCount: number;
  characterCount: number;
  warnings: ExtractionWarning[];
  appliedAt: string | null;
  createdAt: string;
}

/** The proposed chapter mapping the author reviews before importing. */
export interface SourcePreview {
  version: number;
  status: ExtractionState;
  /** When the version was applied to the manuscript, if it was. */
  appliedAt: string | null;
  warnings: ExtractionWarning[];
  passages: ExtractedPassage[];
  proposals: { title: string; locators: string[] }[];
}

/** The result of a confirmed import. */
export interface ImportResult {
  created: { id: string; title: string }[];
  appended: { id: string; title: string }[];
  version: number;
  /** True when the version was already imported, so nothing changed. */
  alreadyApplied: boolean;
}

/** The citations of a chapter. */
export interface ChapterCitations {
  chapter: { id: string; title: string };
  citations: {
    id: string;
    sourceId: string;
    sourceTitle: string;
    note: string;
    locators: string[];
    stale: boolean;
    updatedAt: string;
  }[];
}

/** The links of a source. */
export interface SourceLink {
  id: string;
  chapter: { id: string; title: string; position: number };
  locators: string[];
  note: string;
}

/** One cited passage, opened by clicking a citation. */
export interface PassageDetail {
  source: { id: string; title: string };
  version: number;
  passage: ExtractedPassage;
}

export const sourceKeys = {
  list: (bookId: string) => ["sources", bookId] as const,
  detail: (sourceId: string) => ["source", sourceId] as const,
  versions: (sourceId: string) => ["source-versions", sourceId] as const,
  preview: (sourceId: string, version?: number) => ["source-preview", sourceId, version ?? "latest"] as const,
  links: (sourceId: string) => ["source-links", sourceId] as const,
  chapterCitations: (chapterId: string) => ["chapter-citations", chapterId] as const,
};

/** Every source of a book, newest first. */
export function useSources(bookId: string) {
  return useQuery({
    queryKey: sourceKeys.list(bookId),
    queryFn: () => api.get<{ sources: SourceRow[] }>(`/books/${bookId}/sources`).then((r) => r.sources),
  });
}

/** The proposed chapter mapping, fetched only when the author opens the preview. */
export function useSourcePreview(sourceId: string | null, version?: number) {
  return useQuery({
    queryKey: sourceKeys.preview(sourceId ?? "none", version),
    queryFn: () =>
      api.get<SourcePreview>(`/sources/${sourceId}/preview${version ? `?version=${version}` : ""}`),
    enabled: Boolean(sourceId),
  });
}

/** The passages of the current version of a source. */
export function useSourcePassages(sourceId: string | null) {
  return useQuery({
    queryKey: [...sourceKeys.detail(sourceId ?? "none"), "passages"],
    queryFn: () =>
      api
        .get<{ version: number; passages: ExtractedPassage[]; warnings: ExtractionWarning[] }>(
          `/sources/${sourceId}/passages`,
        )
        .then((r) => r.passages),
    enabled: Boolean(sourceId),
  });
}

/** The citations of a chapter, shown in the research workspace and the editor. */
export function useChapterCitations(chapterId: string | null) {
  return useQuery({
    queryKey: sourceKeys.chapterCitations(chapterId ?? "none"),
    queryFn: () => api.get<ChapterCitations>(`/chapters/${chapterId}/sources`),
    enabled: Boolean(chapterId),
  });
}

/** The links of a source. */
export function useSourceLinks(sourceId: string | null) {
  return useQuery({
    queryKey: sourceKeys.links(sourceId ?? "none"),
    queryFn: () => api.get<{ links: SourceLink[] }>(`/sources/${sourceId}/links`).then((r) => r.links),
    enabled: Boolean(sourceId),
  });
}

/**
 * Uploads a source file.
 *
 * The file itself is the request body, so the metadata travels in the query
 * string and the body stays exactly the bytes on disk.
 */
export function useUploadSource(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, title, format, provenance, license }: { file: File; title: string; format: SourceFormat; provenance: string; license: string }) => {
      const query = new URLSearchParams({ title, format, provenance, license });
      const res = await fetch(`/api/v1/books/${bookId}/sources?${query.toString()}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = data?.error;
        throw new Error(err?.message ?? `Upload failed (${res.status})`);
      }
      return data as { source: SourceRow; version: SourceVersionRow };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.list(bookId) });
    },
  });
}

/** Confirms a preview and writes the imported chapters into the manuscript. */
export function useApplyImport(sourceId: string, bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { version: number; chapters: { title: string; locators: string[] }[]; appendToChapterIds: string[] }) =>
      api.post<ImportResult>(`/sources/${sourceId}/apply`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.list(bookId) });
      void qc.invalidateQueries({ queryKey: sourceKeys.links(sourceId) });
      void qc.invalidateQueries({ queryKey: ["book"] });
      void qc.invalidateQueries({ queryKey: ["chapters"] });
      void qc.invalidateQueries({ queryKey: ["chapter-citations"] });
    },
  });
}

/** Links a source to a chapter with the passages that support it. */
export function useLinkSource(sourceId: string, bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chapterId: string; locators: string[]; note: string }) =>
      api.post<{ link: ChapterSourceLink }>(`/sources/${sourceId}/links`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.links(sourceId) });
      void qc.invalidateQueries({ queryKey: sourceKeys.list(bookId) });
      void qc.invalidateQueries({ queryKey: ["chapter-citations"] });
    },
  });
}

/** Deletes a source. The chapters it supported are kept; only the link goes. */
export function useDeleteSource(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.delete(`/sources/${sourceId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.list(bookId) });
    },
  });
}

/** Asks a question that is answered from the book's own sources. */
export function useSourceQuestion(bookId: string) {
  return useMutation({
    mutationFn: (input: { question: string; sourceIds: string[] }) =>
      api.post<{ answer: SourceAnswer }>(`/books/${bookId}/research/ask`, input),
  });
}

/** Summarizes the book's sources. */
export function useSourceSummary(bookId: string) {
  return useMutation({
    mutationFn: (input: { sourceIds: string[] }) =>
      api.post<{ summary: SourceSummary }>(`/books/${bookId}/research/summary`, input),
  });
}

/** Opens one cited passage. */
export async function fetchPassage(sourceId: string, locator: string): Promise<PassageDetail> {
  return api.get<PassageDetail>(`/sources/${sourceId}/passages/${encodeURIComponent(locator)}`);
}

export { errorMessage };
export type { EvidencePassage, ExtractedPassage, SourceAnswer, SourceFormat, SourceSummary };
