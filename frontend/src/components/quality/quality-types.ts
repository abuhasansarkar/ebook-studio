import type { AnchorLocation, DetectionMethod, QualityCategory, QualitySeverity, ReviewStatus, TextAnchor } from '@ebook/shared';

export type ReportJob = { status: string; progress: number; total: number; cancelRequested: boolean; creditsReserved: number; creditsCharged: number; error: string | null; model: string | null } | null;
export type ReportSummary = {
  counts?: Record<QualitySeverity, number>; byCategory?: Record<string, number>; needsHumanReview?: number;
  checks?: { id: string; label: string; method: DetectionMethod; scope: string }[]; notChecked?: string[]; truncated?: boolean | string[]; carriedDismissals?: number;
  reviewed?: string[]; skipped?: { id: string; reason: string }[]; discarded?: number;
};
export type QualityReport = {
  id: string; kind: 'rules' | 'ai'; status: string; stale: boolean; rulesVersion: number; createdAt: string; completedAt: string | null; jobId: string | null; job: ReportJob;
  inputs: { chapters: { id: string; version: number }[]; designVersion?: number; contextVersion: number; model?: string };
  summary: ReportSummary | null;
};
export type Finding = {
  id: string; ruleId: string; category: QualityCategory; severity: QualitySeverity; method: DetectionMethod; chapterId: string | null;
  anchor: TextAnchor | null; location: AnchorLocation | null; chapter: { title: string; position: number } | null; chapterRemoved: boolean;
  message: string; evidence: string; suggestion: { replacement?: string; advice?: string } | null; needsHumanReview: boolean;
  status: ReviewStatus; reviewNote: string; reviewedByName: string | null; reviewedAt: string | null; createdAt: string;
};
export type ContextState = { version: number; data: { voice: string; terms: { preferred: string; avoid: string[]; note: string }[] }; briefTerminology: string };
export type QualityConfig = { creditsPerChapter: number; model: string; mock: boolean; enabled: boolean };
