"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ColoringBookBriefInput,
  ColoringPageItem,
  ColoringPageQuality,
  ColoringPageUpdateInput,
} from "@ebook/shared";
import { api } from "./api";
import { useIsSignedIn } from "./queries";

export interface ColoringPageRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  title: string;
  description: string;
  prompt: string;
  negativePrompt?: string | null;
  caption?: string | null;
  status: "pending" | "generating" | "completed" | "failed";
  assetId?: string | null;
  asset?: {
    id: string;
    storageKey: string;
    width: number;
    height: number;
    status: string;
    createdAt: string;
  } | null;
  qualityChecks?: ColoringPageQuality | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColoringPlanRecord {
  id: string;
  bookId: string;
  topic: string;
  artStyle: string;
  targetAudience: string;
  difficulty: string;
  lineThickness: string;
  trimSize: string;
  bleed: boolean;
  singleSided: boolean;
  pageCount: number;
  density: string;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColoringBookDetail {
  book: {
    id: string;
    title: string;
    subtitle: string;
    language: string;
    bookType: string;
    status: string;
    projectId?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  plan: ColoringPlanRecord;
  pages: ColoringPageRecord[];
  cover?: unknown;
  stats: {
    total: number;
    pending: number;
    generating: number;
    completed: number;
    failed: number;
  };
}

export const coloringKeys = {
  all: ["coloring-books"] as const,
  book: (id: string) => ["coloring-book", id] as const,
  quality: (id: string) => ["coloring-quality", id] as const,
  cover: (id: string) => ["coloring-cover", id] as const,
  package: (id: string) => ["coloring-package", id] as const,
};

export function useColoringBooks() {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: coloringKeys.all,
    queryFn: () => api.get<{ books: Array<{ id: string; title: string; subtitle: string; status: string; coloringPlan?: ColoringPlanRecord; _count: { coloringPages: number }; updatedAt: string }> }>("/coloring/books"),
    enabled: signedIn,
  });
}

export function useColoringBook(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: coloringKeys.book(bookId),
    queryFn: () => api.get<ColoringBookDetail>(`/coloring/books/${bookId}`),
    enabled: signedIn && Boolean(bookId),
    refetchInterval: (query) => {
      // Auto-poll if any page is generating
      const hasGenerating = query.state.data?.pages.some((p) => p.status === "generating");
      return hasGenerating ? 3000 : false;
    },
  });
}

export function useCreateColoringPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ColoringBookBriefInput) =>
      api.post<{ book: { id: string }; plan: ColoringPlanRecord; pages: ColoringPageRecord[] }>("/coloring/plan", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useUpdateColoringPlan(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { title?: string; subtitle?: string; approved?: boolean }) =>
      api.patch<{ plan: ColoringPlanRecord }>(`/coloring/books/${bookId}/plan`, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
    },
  });
}

export function useUpdateColoringPage(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, updates }: { pageId: string; updates: ColoringPageUpdateInput }) =>
      api.patch<{ page: ColoringPageRecord }>(`/coloring/books/${bookId}/pages/${pageId}`, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
    },
  });
}

export function useReorderColoringPages(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageIds: string[]) =>
      api.post<{ pages: ColoringPageRecord[] }>(`/coloring/books/${bookId}/pages/reorder`, { pageIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
    },
  });
}

export function useAddColoringPage(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; prompt: string; description?: string }) =>
      api.post<{ page: ColoringPageRecord }>(`/coloring/books/${bookId}/pages`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
    },
  });
}

export function useDeleteColoringPage(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => api.delete<{ remainingCount: number }>(`/coloring/books/${bookId}/pages/${pageId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
    },
  });
}

export function useGenerateColoringPage(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, promptOverride }: { pageId: string; promptOverride?: string }) =>
      api.post<{ page: ColoringPageRecord }>(`/coloring/books/${bookId}/pages/${pageId}/generate`, { promptOverride }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useGenerateBatchColoring(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageIds?: string[]) =>
      api.post<{ total: number; completed: number; failed: number }>(`/coloring/books/${bookId}/generate-batch`, { pageIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useAutoCleanColoringPage(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api.post<{ page: ColoringPageRecord }>(`/coloring/books/${bookId}/pages/${pageId}/clean`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: coloringKeys.quality(bookId) });
    },
  });
}

export function useAutoCleanAllColoringPages(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ total: number; cleanedCount: number }>(`/coloring/books/${bookId}/quality/auto-clean-all`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: coloringKeys.quality(bookId) });
    },
  });
}

export function useColoringQuality(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: coloringKeys.quality(bookId),
    queryFn: () =>
      api.get<{
        bookId: string;
        stats: { total: number; completed: number };
        pages: Array<{ pageNumber: number; title: string; status: string; assetId?: string; quality?: ColoringPageQuality }>;
      }>(`/coloring/books/${bookId}/quality`),
    enabled: signedIn && Boolean(bookId),
  });
}

export function useColoringCover(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: coloringKeys.cover(bookId),
    queryFn: () =>
      api.get<{
        book: { id: string; title: string; subtitle: string };
        plan: ColoringPlanRecord;
        cover?: unknown;
        coverArtworkAsset?: { id: string; storageKey: string; width: number; height: number } | null;
        spine: {
          interiorPages: number;
          totalPhysicalPages: number;
          spineThicknessInches: number;
          spineThicknessMm: number;
          meetsKdpSpineTextThreshold: boolean;
          singleSided: boolean;
        };
        sampleThumbnails: Array<{ pageNumber: number; title: string; assetId?: string; storageKey?: string }>;
      }>(`/coloring/books/${bookId}/cover`),
    enabled: signedIn && Boolean(bookId),
  });
}

export function useGenerateColoringCover(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { promptOverride?: string; titleOverride?: string; subtitleOverride?: string; authorOverride?: string }) =>
      api.post<{ cover: unknown; asset: { id: string } }>(`/coloring/books/${bookId}/cover`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: coloringKeys.cover(bookId) });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useColoringPublishingPackage(bookId: string) {
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: coloringKeys.package(bookId),
    queryFn: () =>
      api.get<{
        title: string;
        subtitle: string;
        amazonDescriptionHtml: string;
        sevenKeywords: string[];
        recommendedCategories: string[];
        preflight: {
          meetsMinPages: boolean;
          pageCount: number;
          trimSize: string;
          bleed: boolean;
          singleSided: boolean;
          dpi300Compliant: boolean;
          marginsCompliant: boolean;
          readyToPublish: boolean;
        };
        kdpUploadChecklist: string[];
      }>(`/coloring/books/${bookId}/export/package`),
    enabled: signedIn && Boolean(bookId),
  });
}

export function useCompileColoringPdf(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ exportId: string; pageCount: number; fileSize: number; storageKey: string; kdpCompliant: boolean }>(
        `/coloring/books/${bookId}/export/compile`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coloringKeys.book(bookId) });
      void queryClient.invalidateQueries({ queryKey: ["exports", bookId] });
    },
  });
}
