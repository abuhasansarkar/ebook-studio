"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookBriefInput, Outline } from "@ebook/shared";
import { api } from "./api";
import type { BookDetail, BookSummary, ChapterFull, ChapterMeta, CreditTransaction, Dashboard, ExportRecord, GenerationJob } from "./types";

export const qk = {
  dashboard: ["dashboard"] as const,
  books: (search?: string) => ["books", search ?? ""] as const,
  book: (id: string) => ["book", id] as const,
  chapters: (bookId: string) => ["chapters", bookId] as const,
  chapter: (id: string) => ["chapter", id] as const,
  exports: (bookId: string) => ["exports", bookId] as const,
  credits: ["credits"] as const,
  config: ["config"] as const,
};

export function usePublicConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => api.get<{ auth: { google: boolean } }>("/config"),
    staleTime: Infinity,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => api.get<Dashboard>("/users/me/dashboard") });
}

export function useBooks(search?: string) {
  return useQuery({
    queryKey: qk.books(search),
    queryFn: () => api.get<{ books: BookSummary[] }>(`/books${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => r.books),
  });
}

/** Polls while a job is active so progress is live. */
export function useBook(bookId: string) {
  return useQuery({
    queryKey: qk.book(bookId),
    queryFn: () => api.get<{ book: BookDetail }>(`/books/${bookId}`).then((r) => r.book),
    refetchInterval: (q) => (q.state.data?.activeJob ? 1500 : false),
  });
}

export function useChapters(bookId: string, poll = false) {
  return useQuery({
    queryKey: qk.chapters(bookId),
    queryFn: () => api.get<{ chapters: ChapterMeta[] }>(`/books/${bookId}/chapters`).then((r) => r.chapters),
    refetchInterval: poll ? 3000 : false,
  });
}

export function useChapter(chapterId: string | null) {
  return useQuery({
    queryKey: qk.chapter(chapterId ?? "none"),
    queryFn: () => api.get<{ chapter: ChapterFull }>(`/chapters/${chapterId}`).then((r) => r.chapter),
    enabled: Boolean(chapterId),
    // The editor owns the document while open; never clobber it with a background refetch.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useExports(bookId: string) {
  return useQuery({
    queryKey: qk.exports(bookId),
    queryFn: () => api.get<{ exports: ExportRecord[] }>(`/books/${bookId}/exports`).then((r) => r.exports),
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "queued" || e.status === "processing") ? 1500 : false),
  });
}

export function useCredits() {
  return useQuery({
    queryKey: qk.credits,
    queryFn: () => api.get<{ wallet: { balance: number; reserved: number }; transactions: CreditTransaction[] }>("/credits"),
  });
}

// ---------- Mutations ----------
function useInvalidateBook(bookId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.book(bookId) });
    void qc.invalidateQueries({ queryKey: qk.chapters(bookId) });
    void qc.invalidateQueries({ queryKey: qk.credits });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: ["books"] });
  };
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brief: BookBriefInput) =>
      api.post<{ book: BookSummary; job: GenerationJob | null; outlineError: { code: string; message: string } | null }>("/books", { brief }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.credits });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookId: string) => api.delete(`/books/${bookId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["books"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useBookAction(bookId: string) {
  const invalidate = useInvalidateBook(bookId);
  return {
    generateOutline: useMutation({ mutationFn: () => api.post(`/books/${bookId}/outline/generate`), onSettled: invalidate }),
    saveOutline: useMutation({ mutationFn: (o: Outline) => api.put(`/books/${bookId}/outline`, o), onSettled: invalidate }),
    approveOutline: useMutation({ mutationFn: () => api.post(`/books/${bookId}/outline/approve`), onSettled: invalidate }),
    startGeneration: useMutation({ mutationFn: () => api.post<{ job: GenerationJob }>(`/books/${bookId}/generate`), onSettled: invalidate }),
    cancelGeneration: useMutation({ mutationFn: () => api.post(`/books/${bookId}/generate/cancel`), onSettled: invalidate }),
  };
}

export function useCreateExport(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ export: ExportRecord }>(`/books/${bookId}/exports`, { format: "pdf" }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.exports(bookId) }),
  });
}
