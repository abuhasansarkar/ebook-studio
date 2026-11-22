import { z } from "zod";
import { LANGUAGE_CODES } from "./languages";

// ---------- Visual Art Styles ----------
export const COLORING_STYLES = [
  "kawaii_chibi",
  "mandala_patterns",
  "anime",
  "bold_easy",
  "florals_botanicals",
  "cute_animals",
  "fantasy_magical",
  "dinosaurs",
  "ocean_sea_life",
  "vehicles_machines",
  "geometric_abstract",
  "fairy_tales",
] as const;
export type ColoringStyle = (typeof COLORING_STYLES)[number];

export interface ColoringStyleMeta {
  id: ColoringStyle;
  label: string;
  tagline: string;
  description: string;
  keywords: string[];
}

export const COLORING_STYLE_CATALOG: Record<ColoringStyle, ColoringStyleMeta> = {
  kawaii_chibi: {
    id: "kawaii_chibi",
    label: "Kawaii Chibi",
    tagline: "Cute & Charming",
    description: "Cute characters, large eyes, sweet expressions, and rounded shapes.",
    keywords: ["cute", "chibi", "kawaii", "rounded", "sweet"],
  },
  mandala_patterns: {
    id: "mandala_patterns",
    label: "Mandala & Patterns",
    tagline: "Intricate & Relaxing",
    description: "Detailed symmetrical circular geometric and botanical patterns for stress relief.",
    keywords: ["mandala", "symmetry", "geometry", "mindfulness", "intricate"],
  },
  anime: {
    id: "anime",
    label: "Anime & Manga",
    tagline: "Dynamic & Expressive",
    description: "Expressive characters, clean manga ink outlines, and stylized scenes.",
    keywords: ["anime", "manga", "japanese", "dynamic", "expressive"],
  },
  bold_easy: {
    id: "bold_easy",
    label: "Bold & Easy",
    tagline: "Simple & Thick Lines",
    description: "Extra-thick marker outlines and large open coloring areas for toddlers and seniors.",
    keywords: ["bold", "easy", "thick", "toddler", "simple"],
  },
  florals_botanicals: {
    id: "florals_botanicals",
    label: "Florals & Botanicals",
    tagline: "Nature & Garden",
    description: "Flowers, leaves, garden plants, succulent bouquets, and organic blooms.",
    keywords: ["flowers", "plants", "botanical", "garden", "nature"],
  },
  cute_animals: {
    id: "cute_animals",
    label: "Cute Animals",
    tagline: "Pets & Wildlife",
    description: "Charming farm animals, pets, baby forest creatures, and safari friends.",
    keywords: ["animals", "pets", "wildlife", "farm", "creatures"],
  },
  fantasy_magical: {
    id: "fantasy_magical",
    label: "Fantasy & Magical",
    tagline: "Castles & Mythical",
    description: "Fairies, unicorns, friendly dragons, castles, and mystical worlds.",
    keywords: ["fantasy", "magic", "unicorns", "dragons", "fairies"],
  },
  dinosaurs: {
    id: "dinosaurs",
    label: "Dinosaurs",
    tagline: "Prehistoric Adventures",
    description: "T-Rex, triceratops, stegosaurus, and fun Jurassic prehistoric adventures.",
    keywords: ["dinosaurs", "jurassic", "prehistoric", "t-rex", "volcano"],
  },
  ocean_sea_life: {
    id: "ocean_sea_life",
    label: "Ocean & Sea Life",
    tagline: "Marine & Underwater",
    description: "Sea turtles, friendly dolphins, tropical fish, coral reefs, and sea creatures.",
    keywords: ["ocean", "sea", "fish", "turtles", "marine"],
  },
  vehicles_machines: {
    id: "vehicles_machines",
    label: "Vehicles & Machines",
    tagline: "Cars, Trucks & Planes",
    description: "Construction trucks, race cars, airplanes, rockets, and trains.",
    keywords: ["cars", "trucks", "planes", "trains", "machines"],
  },
  geometric_abstract: {
    id: "geometric_abstract",
    label: "Geometric & Abstract",
    tagline: "Modern Patterns",
    description: "Calming repeating tessellations, modern optical art, and abstract patterns.",
    keywords: ["geometric", "abstract", "tessellation", "modern", "calming"],
  },
  fairy_tales: {
    id: "fairy_tales",
    label: "Fairytales & Folklore",
    tagline: "Enchanted Storybooks",
    description: "Storybook characters, enchanted forests, kingdoms, and classic legends.",
    keywords: ["fairytales", "folklore", "storybook", "kingdom", "enchanted"],
  },
};

// ---------- Settings & Constraints ----------
export const COLORING_AUDIENCES = ["preschool", "children", "teens", "adults"] as const;
export type ColoringAudience = (typeof COLORING_AUDIENCES)[number];

export const COLORING_AUDIENCE_LABELS: Record<ColoringAudience, string> = {
  preschool: "Preschool & Toddlers (Ages 2-4)",
  children: "Children & Kids (Ages 5-9)",
  teens: "Teens & Tweens (Ages 10-16)",
  adults: "Adults & Seniors (Relaxation)",
};

export const COLORING_DIFFICULTIES = ["very_easy", "easy", "medium", "detailed"] as const;
export type ColoringDifficulty = (typeof COLORING_DIFFICULTIES)[number];

export const COLORING_DIFFICULTY_LABELS: Record<ColoringDifficulty, string> = {
  very_easy: "Very Easy (Large shapes, few elements)",
  easy: "Easy (Simple scenes, clear spaces)",
  medium: "Medium (Balanced detail & coloring fun)",
  detailed: "Detailed (Intricate lines & patterns)",
};

export const COLORING_LINE_THICKNESS = ["thin", "medium", "thick"] as const;
export type ColoringLineThickness = (typeof COLORING_LINE_THICKNESS)[number];

export const COLORING_LINE_THICKNESS_LABELS: Record<ColoringLineThickness, string> = {
  thin: "Thin Lines (Detailed ink contours)",
  medium: "Medium Lines (Balanced, standard)",
  thick: "Thick Lines (Bold marker outlines)",
};

export const COLORING_TRIM_SIZES = ["8.5x11", "8.5x8.5", "8.25x11", "A4"] as const;
export type ColoringTrimSize = (typeof COLORING_TRIM_SIZES)[number];

export const COLORING_TRIM_SIZE_META: Record<ColoringTrimSize, { label: string; widthIn: number; heightIn: number; aspect: "portrait" | "square" }> = {
  "8.5x11": { label: "8.5\" × 11\" (US Letter - Most Popular)", widthIn: 8.5, heightIn: 11.0, aspect: "portrait" },
  "8.5x8.5": { label: "8.5\" × 8.5\" (Square - Great for Mandalas)", widthIn: 8.5, heightIn: 8.5, aspect: "square" },
  "8.25x11": { label: "8.25\" × 11\" (Children's Classic)", widthIn: 8.25, heightIn: 11.0, aspect: "portrait" },
  "A4": { label: "A4 (8.27\" × 11.69\" / 210 × 297 mm)", widthIn: 8.27, heightIn: 11.69, aspect: "portrait" },
};

export const COLORING_PAGE_COUNTS = [24, 30, 40, 50, 60] as const;

// ---------- Credit Costs ----------
export const COLORING_CREDIT_COSTS = {
  plan: 0,
  perIllustration: 8,
  cover: 10,
} as const;

export function estimateColoringCredits(pageCount: number): number {
  return pageCount * COLORING_CREDIT_COSTS.perIllustration;
}

// ---------- Zod Schemas ----------
export const coloringBookBriefSchema = z.object({
  topic: z.string().trim().min(3, "Describe your idea in at least a few words").max(1000),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  subtitle: z.string().trim().max(300).optional().or(z.literal("")),
  language: z.enum(LANGUAGE_CODES).default("en"),
  artStyle: z.enum(COLORING_STYLES).default("kawaii_chibi"),
  targetAudience: z.enum(COLORING_AUDIENCES).default("children"),
  difficulty: z.enum(COLORING_DIFFICULTIES).default("easy"),
  lineThickness: z.enum(COLORING_LINE_THICKNESS).default("medium"),
  trimSize: z.enum(COLORING_TRIM_SIZES).default("8.5x11"),
  singleSided: z.boolean().default(true),
  bleed: z.boolean().default(false),
  pageCount: z.number().int().min(24, "Minimum 24 pages for KDP paperback").max(60).default(24),
  density: z.enum(["minimal", "balanced", "detailed"]).default("balanced"),
  authorName: z.string().trim().max(120).optional().or(z.literal("")),
  projectId: z.string().min(1).max(100).nullable().optional(),
  extraInstructions: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type ColoringBookBriefInput = z.input<typeof coloringBookBriefSchema>;
export type ColoringBookBrief = z.output<typeof coloringBookBriefSchema>;

export const coloringPageItemSchema = z.object({
  id: z.string().optional(),
  pageNumber: z.number().int().positive(),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(1000).default(""),
  prompt: z.string().trim().min(5, "Prompt is required").max(2000),
  negativePrompt: z.string().trim().max(1000).optional().or(z.literal("")),
  caption: z.string().trim().max(100).optional().or(z.literal("")),
});
export type ColoringPageItem = z.infer<typeof coloringPageItemSchema>;

export const coloringPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).default(""),
  pages: z.array(coloringPageItemSchema).min(24).max(60),
});
export type ColoringPlanData = z.infer<typeof coloringPlanSchema>;

export const coloringPageQualitySchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  checks: z.object({
    pureWhiteBackground: z.boolean(),
    zeroColorSaturation: z.boolean(),
    lineContrastAdequate: z.boolean(),
    dpi300Compliant: z.boolean(),
  }),
  issues: z.array(z.string()),
});
export type ColoringPageQuality = z.infer<typeof coloringPageQualitySchema>;

export const coloringPageUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  prompt: z.string().trim().min(5).max(2000).optional(),
  negativePrompt: z.string().trim().max(1000).optional().nullable(),
  caption: z.string().trim().max(100).optional().nullable(),
  assetId: z.string().optional().nullable(),
});
export type ColoringPageUpdateInput = z.infer<typeof coloringPageUpdateSchema>;

export const coloringPageReorderSchema = z.object({
  pageIds: z.array(z.string().min(1)).min(1),
});
export type ColoringPageReorderInput = z.infer<typeof coloringPageReorderSchema>;
