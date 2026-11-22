import { z } from "zod";
import { LANGUAGE_CODES } from "./languages";

// ---------- Book brief ----------
export const BOOK_TYPES = [
  "guide",
  "lead_magnet",
  "workbook",
  "report",
  "course",
  "self_help",
  "educational",
  "recipe",
  "travel",
  "fiction",
  "coloring_book",
] as const;
export type BookType = (typeof BOOK_TYPES)[number];

export const BOOK_TYPE_LABELS: Record<BookType, string> = {
  guide: "How-to guide",
  lead_magnet: "Lead magnet",
  workbook: "Workbook",
  report: "Report",
  course: "Course book",
  self_help: "Self-help",
  educational: "Educational",
  recipe: "Recipe book",
  travel: "Travel guide",
  fiction: "Fiction",
  coloring_book: "AI Coloring Book",
};

export const TONES = ["friendly", "professional", "conversational", "authoritative", "inspirational", "academic", "playful"] as const;
export const KNOWLEDGE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const DEPTHS = ["overview", "standard", "in_depth"] as const;

export const bookBriefSchema = z.object({
  topic: z.string().trim().min(5, "Describe your idea in at least a few words").max(1000),
  bookType: z.enum(BOOK_TYPES).default("guide"),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  targetAudience: z.string().trim().max(300).default("General readers"),
  knowledgeLevel: z.enum(KNOWLEDGE_LEVELS).default("beginner"),
  readerProblem: z.string().trim().max(500).optional().or(z.literal("")),
  readerOutcome: z.string().trim().max(500).optional().or(z.literal("")),
  language: z.enum(LANGUAGE_CODES).default("en"),
  tone: z.enum(TONES).default("friendly"),
  depth: z.enum(DEPTHS).default("standard"),
  chapterCount: z.number().int().min(3).max(20).default(8),
  wordsPerChapter: z.number().int().min(300).max(5000).default(1500),
  authorName: z.string().trim().max(120).optional().or(z.literal("")),
  purpose: z.string().trim().max(300).default(""),
  readerAge: z.string().trim().max(100).default(""),
  writingStyle: z.string().trim().max(300).default(""),
  pointOfView: z.string().trim().max(100).default(""),
  brandName: z.string().trim().max(120).default(""),
  terminology: z.string().trim().max(2000).default(""),
  extraInstructions: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type BookBriefInput = z.input<typeof bookBriefSchema>;
export type BookBrief = z.output<typeof bookBriefSchema>;

// ---------- Outline ----------
export const outlineChapterSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(600).default(""),
  keyPoints: z.array(z.string().trim().max(300)).max(12).default([]),
  targetWords: z.number().int().min(200).max(6000).default(1500),
});
export type OutlineChapter = z.output<typeof outlineChapterSchema>;

export const outlineSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).default(""),
  chapters: z.array(outlineChapterSchema).min(1).max(30),
});
export type Outline = z.output<typeof outlineSchema>;

// ---------- Books ----------
export const createBookSchema = z.object({
  brief: bookBriefSchema,
  /**
   * The project the book is filed under.
   *
   * An empty string is not a project id. The column carries a foreign key, so
   * an empty value would be refused by the database as an internal fault
   * rather than as the bad request it is. `null` means "no project".
   */
  projectId: z.string().min(1).max(100).nullable().optional(),
});

export const BOOK_STATUSES = ["draft", "outline_ready", "generating", "written", "failed"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const CHAPTER_STATUSES = ["pending", "generating", "done", "failed"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ---------- Chapters / editor ----------
export const updateChapterSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().min(0),
});

/** A new chapter order: every chapter of the book, each exactly once. */
export const chapterOrderSchema = z.object({
  chapterIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
}).strict();
export type ChapterOrderInput = z.infer<typeof chapterOrderSchema>;

// ---------- AI assistant ----------
export const ASSIST_ACTIONS = [
  "rewrite",
  "expand",
  "shorten",
  "simplify",
  "professional",
  "conversational",
  "proofread",
  "add_example",
  "to_bullets",
  "custom",
] as const;
export type AssistAction = (typeof ASSIST_ACTIONS)[number];

export const ASSIST_ACTION_LABELS: Record<AssistAction, string> = {
  rewrite: "Rewrite",
  expand: "Expand",
  shorten: "Shorten",
  simplify: "Simplify",
  professional: "Make professional",
  conversational: "Make conversational",
  proofread: "Fix grammar",
  add_example: "Add an example",
  to_bullets: "Convert to bullets",
  custom: "Custom prompt",
};

export const assistSchema = z.object({
  bookId: z.string(),
  action: z.enum(ASSIST_ACTIONS),
  text: z.string().min(1).max(8000),
  instruction: z.string().max(1000).optional(),
});

// ---------- Credits ----------
/** Credit pricing rules (product-level, not model-level). */
export const CREDIT_COSTS = {
  outline: 2,
  chapterPer1000Words: 3,
  assist: 1,
  export: 0,
} as const;

/** Credits charged for one written chapter. */
export function chapterCredits(targetWords: number): number {
  return Math.ceil(Math.max(1, targetWords / 1000) * CREDIT_COSTS.chapterPer1000Words);
}

export function estimateBookCredits(chapterCount: number, wordsPerChapter: number): number {
  return chapterCount * chapterCredits(wordsPerChapter);
}

export const FREE_SIGNUP_CREDITS = 99;
