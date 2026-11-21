import { z } from "zod";

/**
 * S15 — the marketing studio contract.
 *
 * The studio produces launch material for a book the author has written. Two
 * rules hold throughout:
 *
 * - Every output stays editable. Nothing the studio produces is published,
 * emailed or posted anywhere; the author downloads it and decides.
 * - Every output is traceable to the manuscript it came from. The chapter
 *   versions are captured with the draft, so a stale draft is visible rather
 *   than quietly wrong.
 */

/** The kinds of material the studio can draft. */
export const MARKETING_OUTPUT_TYPES = [
  "description",
  "summary",
  "author_bio",
  "sales_copy",
  "keywords",
  "email_draft",
  "social_caption",
  "carousel_outline",
  "video_script",
] as const;
export type MarketingOutputType = typeof MARKETING_OUTPUT_TYPES[number];

/** The label each output type is shown under. */
export const MARKETING_OUTPUT_LABELS: Record<MarketingOutputType, string> = {
  description: "Store description",
  summary: "Back-cover summary",
  author_bio: "Author biography",
  sales_copy: "Sales page copy",
  keywords: "Keywords",
  email_draft: "Email draft",
  social_caption: "Social caption",
  carousel_outline: "Carousel outline",
  video_script: "Short-video script",
};

/**
 * The output types that are a list rather than a piece of prose.
 *
 * The editor treats these differently, because a keyword list edited as prose
 * ends up unreadable.
 */
export const MARKETING_LIST_TYPES: readonly MarketingOutputType[] = ["keywords", "carousel_outline"];

/** The tone a piece of copy can be written in. */
export const MARKETING_TONES = ["clear", "warm", "bold", "technical", "playful"] as const;
export type MarketingTone = typeof MARKETING_TONES[number];

/**
 * The request for a draft.
 *
 * The context fields are optional because a missing field is something the
 * studio can work around; the type is what decides what is drafted.
 */
export const marketingDraftSchema = z.object({
  /** The kind of material to draft. */
  outputType: z.enum(MARKETING_OUTPUT_TYPES),
  /** The tone of voice. */
  tone: z.enum(MARKETING_TONES).optional().default("clear"),
  /** Who the copy is for. */
  audience: z.string().trim().max(500).optional(),
  /** Extra direction from the author. */
  instruction: z.string().trim().max(2000).optional(),
  /** The author or pen name, when it differs from the brief. */
  authorName: z.string().trim().max(200).optional(),
}).strict();
export type MarketingDraftInput = z.infer<typeof marketingDraftSchema>;

/** The state of a draft. */
export type MarketingDraftStatus = "draft" | "edited" | "approved";

/**
 * A claim the studio flagged for the author to check.
 *
 * The studio never asserts a result, an endorsement or a performance
 * guarantee. When the generated text contains something of that shape, it is
 * flagged rather than published.
 */
export interface MarketingFlag {
  id: string;
  /** The kind of problem the flag is about. */
  kind: "unsupported_claim" | "endorsement" | "guarantee" | "sample_claim" | "price_claim" | "stale_input";
  /** What the author should look at. */
  message: string;
  /** The phrase that triggered the flag, when there is one. */
  excerpt?: string;
}

/** A generated draft. */
export interface MarketingDraft {
  id: string;
  bookId: string;
  outputType: MarketingOutputType;
  status: MarketingDraftStatus;
  /** The generated text. The author may edit it. */
  content: string;
  /** The tone the draft was written in. */
  tone: MarketingTone;
  /** The audience the draft was written for. */
  audience?: string;
  /** The author's own instruction, kept with the draft. */
  instruction?: string;
  /** The chapter versions the draft was written from. */
  chapterVersions: { id: string; version: number }[];
  /** The rules version the draft was produced under. */
  rulesVersion: string;
  /** The problems the author should look at. */
  flags: MarketingFlag[];
  /** Whether the manuscript has moved on since the draft was written. */
  stale: boolean;
  /** The credits the draft cost. */
  creditsCharged: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The request to save an edited draft.
 *
 * The version is checked, so an edit in one tab does not silently overwrite
 * an edit in another.
 */
export const marketingSaveSchema = z.object({
  content: z.string().max(50_000),
  /** The version the edit was based on. */
  baseVersion: z.number().int().optional(),
  /** Whether the author approves the draft for use. */
  approve: z.boolean().optional().default(false),
}).strict();
export type MarketingSaveInput = z.infer<typeof marketingSaveSchema>;

/** The promotional graphic templates. */
export const MARKETING_GRAPHIC_TEMPLATES = ["square_quote", "square_cover", "story_announcement", "wide_banner"] as const;
export type MarketingGraphicTemplate = typeof MARKETING_GRAPHIC_TEMPLATES[number];

/** The size each template renders at. */
export const MARKETING_GRAPHIC_SIZES: Record<MarketingGraphicTemplate, { width: number; height: number }> = {
  square_quote: { width: 1080, height: 1080 },
  square_cover: { width: 1080, height: 1080 },
  story_announcement: { width: 1080, height: 1920 },
  wide_banner: { width: 1200, height: 628 },
};

/** The request for a promotional graphic. */
export const marketingGraphicSchema = z.object({
  template: z.enum(MARKETING_GRAPHIC_TEMPLATES),
  /** The text on the graphic. */
  headline: z.string().trim().min(1).max(200),
  /** The supporting line. */
  subhead: z.string().trim().max(300).optional(),
  /** The call to action. */
  callToAction: z.string().trim().max(120).optional(),
  /** The text colour, as a hex value. */
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#1b1b1f"),
  /** The background colour, as a hex value. */
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#f5f1e8"),
  /** Whether to use the book's saved cover. */
  useCover: z.boolean().optional().default(true),
}).strict();
export type MarketingGraphicInput = z.infer<typeof marketingGraphicSchema>;

/** A composed promotional graphic. */
export interface MarketingGraphic {
  id: string;
  bookId: string;
  template: MarketingGraphicTemplate;
  width: number;
  height: number;
  headline: string;
  subhead?: string;
  callToAction?: string;
  textColor: string;
  backgroundColor: string;
  /** Whether the book's cover was used. */
  usedCover: boolean;
  /** The storage key of the rendered image. */
  storageKey?: string;
  /** Whether the image was rendered and verified. */
  ready: boolean;
  createdAt: string;
}

/** The sample chapter selection. */
export const sampleChapterSchema = z.object({
  /** The chapters to include. */
  chapterIds: z.array(z.string().trim().min(1).max(64)).min(1).max(5),
  /** Whether to put them in one file or keep them separate. */
  format: z.enum(["pdf", "epub", "docx"]).optional().default("pdf"),
}).strict();
export type SampleChapterInput = z.infer<typeof sampleChapterSchema>;

/** The formats a sample pack can be produced in. */
export const MARKETING_SAMPLE_FORMATS = ["pdf", "epub", "docx"] as const;
export type MarketingSampleFormat = typeof MARKETING_SAMPLE_FORMATS[number];

/**
 * An assembled sample chapter pack.
 *
 * The pack is a file the author downloads and hands out themselves. It is
 * never emailed, posted or sent to a store.
 */
export interface MarketingSample {
  id: string;
  bookId: string;
  /** The chapters included, in the book's own order. */
  chapterIds: string[];
  /** The titles of those chapters, for the interface. */
  chapterTitles: string[];
  format: MarketingSampleFormat;
  /** The size of the produced file, in bytes. */
  fileSize: number;
  /** Whether the file was rendered and validated. */
  ready: boolean;
  createdAt: string;
}

/**
 * The phrases that make a claim the studio will not make on the author's
 * behalf.
 *
 * The studio flags these rather than removing them, so the author can decide
 * whether a sentence is a claim or a description.
 */
export const MARKETING_CLAIM_PATTERNS: { kind: MarketingFlag["kind"]; pattern: RegExp; message: string }[] = [
  {
    kind: "guarantee",
    pattern: /\b(guarantee[ds]?|guaranteed|risk[- ]free|100%\s+(safe|guaranteed))\b/i,
    message: "This promises a result. Stores and reviewers reject unverifiable guarantees — replace it with what the reader can actually expect.",
  },
  {
    kind: "endorsement",
    pattern: /\b(endorsed by|as (seen|featured) in|best[- ]seller|#1 best|sellers? love|award[- ]winning|acclaimed)\b/i,
    message: "This claims an endorsement, a ranking or an award. Only say it if you can show the proof.",
  },
  {
    kind: "unsupported_claim",
    pattern: /\b(cures?|treats?|prevents?|diagnos(e|es)|clinically proven|medically proven|research (proves|shows))\b/i,
    message: "This reads as a health, medical or efficacy claim. Say what the book teaches instead of what it fixes.",
  },
  {
    kind: "price_claim",
    pattern: /\b(only for|now only|limited time|free today|half price|discount ends)\b/i,
    message: "This is a pricing claim. Prices and promotions change — check it before you use it.",
  },
];

/**
 * The flags a piece of copy raises.
 *
 * The check is deliberately simple and readable: it looks for the shapes of
 * claims that would need proof. It does not judge whether a sentence is
 * accurate — only the author can do that.
 */
export function marketingFlags(content: string, options: { stale?: boolean } = {}): MarketingFlag[] {
  const flags: MarketingFlag[] = [];
  for (const rule of MARKETING_CLAIM_PATTERNS) {
    const match = content.match(rule.pattern);
    if (match) {
      flags.push({
        id: `claim_${rule.kind}`,
        kind: rule.kind,
        message: rule.message,
        excerpt: match[0],
      });
    }
  }
  if (options.stale) {
    flags.push({
      id: "stale_input",
      kind: "stale_input",
      message: "The manuscript has changed since this draft was written. Read it against the current text before you use it.",
    });
  }
  return flags;
}
