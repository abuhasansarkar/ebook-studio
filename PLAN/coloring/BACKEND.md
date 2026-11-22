# Backend Architecture & Technical Design: AI Coloring Book Studio

---

## 1. Data Models (`backend/prisma/schema.prisma`)

We extend `Book` by adding two dedicated models: `ColoringPlan` and `ColoringPage`.

```prisma
// Extension to existing Book model:
model Book {
  // ... existing fields ...
  coloringPlan   ColoringPlan?
  coloringPages  ColoringPage[]
}

model ColoringPlan {
  id              String    @id @default(cuid())
  bookId          String    @unique
  book            Book      @relation(fields: [bookId], references: [id], onDelete: Cascade)
  topic           String
  artStyle        String    // e.g. "kawaii_chibi", "mandala_patterns", "bold_easy", ...
  targetAudience  String    // "preschool", "children", "teens", "adults"
  difficulty      String    // "very_easy", "easy", "medium", "detailed"
  lineThickness   String    // "thin", "medium", "thick"
  aspectRatio     String    // "portrait", "square", "landscape"
  trimSize        String    // "8.5x11", "8.5x8.5", "8.25x11", "A4"
  bleed           Boolean   @default(false)
  singleSided     Boolean   @default(true)
  pageCount       Int       @default(24)
  density         String    @default("balanced")
  approvedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("coloring_plans")
}

model ColoringPage {
  id              String    @id @default(cuid())
  bookId          String
  book            Book      @relation(fields: [bookId], references: [id], onDelete: Cascade)
  pageNumber      Int
  title           String
  description     String    @default("")
  prompt          String
  negativePrompt  String?
  caption         String?
  status          String    @default("pending") // "pending" | "generating" | "completed" | "failed"
  assetId         String?
  asset           Asset?    @relation(fields: [assetId], references: [id], onDelete: SetNull)
  qualityChecks   Json?     // { passed: boolean, score: number, checks: { ... }, issues: string[] }
  error           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([bookId, pageNumber])
  @@index([bookId, status])
  @@map("coloring_pages")
}
```

---

## 2. Shared Contracts (`packages/shared/src/coloring.ts`)

```ts
import { z } from "zod";

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

export const COLORING_AUDIENCES = ["preschool", "children", "teens", "adults"] as const;
export const COLORING_DIFFICULTIES = ["very_easy", "easy", "medium", "detailed"] as const;
export const COLORING_LINE_THICKNESS = ["thin", "medium", "thick"] as const;
export const COLORING_TRIM_SIZES = ["8.5x11", "8.5x8.5", "8.25x11", "A4"] as const;

export const COLORING_CREDIT_COSTS = {
  plan: 0,                   // 100% Free
  perIllustration: 8,        // 8 credits per page
  cover: 10,                 // 10 credits
} as const;

export function estimateColoringCredits(pageCount: number): number {
  return pageCount * COLORING_CREDIT_COSTS.perIllustration;
}

export const coloringBookBriefSchema = z.object({
  topic: z.string().trim().min(5).max(1000),
  title: z.string().trim().max(200).optional(),
  language: z.string().default("en"),
  artStyle: z.enum(COLORING_STYLES).default("kawaii_chibi"),
  targetAudience: z.enum(COLORING_AUDIENCES).default("children"),
  difficulty: z.enum(COLORING_DIFFICULTIES).default("easy"),
  lineThickness: z.enum(COLORING_LINE_THICKNESS).default("medium"),
  trimSize: z.enum(COLORING_TRIM_SIZES).default("8.5x11"),
  singleSided: z.boolean().default(true),
  bleed: z.boolean().default(false),
  pageCount: z.number().int().min(24).max(60).default(24),
  density: z.enum(["minimal", "balanced", "detailed"]).default("balanced"),
  authorName: z.string().trim().max(120).optional(),
});
export type ColoringBookBrief = z.infer<typeof coloringBookBriefSchema>;

export const coloringPageItemSchema = z.object({
  pageNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  prompt: z.string().trim().min(10).max(2000),
  caption: z.string().trim().max(100).optional(),
});

export const coloringPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300),
  pages: z.array(coloringPageItemSchema).min(24).max(60),
});
export type ColoringPlan = z.infer<typeof coloringPlanSchema>;
```

---

## 3. Strict Line-Art Prompt Engine (`coloringPromptBuilder.ts`)

To ensure the AI generates printable line art rather than shaded or colored pictures, prompts are compiled using strict negative guidance and positive stylistic constraints:

```ts
export function buildColoringPrompt(page: ColoringPage, plan: ColoringPlan): string {
  const styleDirectives: Record<string, string> = {
    kawaii_chibi: "Style: Kawaii Chibi. Adorable character proportions, giant expressive eyes, simple smooth rounded shapes, sweet friendly expression.",
    mandala_patterns: "Style: Intricate Mandala. Radial circular symmetry, ornate repeating geometric and floral patterns, clean crisp borders.",
    anime: "Style: Anime Manga line art. Dynamic expressive line work, clean character features, detailed manga background ink lines.",
    bold_easy: "Style: Bold & Easy. Extra-thick outlines, large open coloring areas, zero tiny details, extremely clean and accessible.",
    florals_botanicals: "Style: Botanical illustration. Elegant floral outlines, detailed petal and leaf contours, organic natural arrangements.",
    cute_animals: "Style: Cute Animal coloring page. Sweet playful animals, clear anatomical shapes, joyful outdoor setting.",
    fantasy_magical: "Style: Fantasy & Magical line art. Whimsical fairy tale motifs, enchanted elements, clean storybook linework.",
    dinosaurs: "Style: Dinosaur adventures. Fun prehistoric dinosaurs, palm trees and volcano outlines, clean line contours.",
    ocean_sea_life: "Style: Underwater ocean life. Sea turtles, friendly fish, coral reef contours, bubbles and marine flora.",
    vehicles_machines: "Style: Vehicles & Machinery. Detailed car/truck/plane outlines, wheels and mechanical shapes, bold outer profile.",
  };

  const audienceThickness: Record<string, string> = {
    preschool: "Lines: Ultra-thick, bold marker outlines (3-4px stroke), broad simple shapes.",
    children: "Lines: Medium-thick crisp outlines, easy to color with colored pencils or crayons.",
    teens: "Lines: Crisp medium-fine ink contours with balanced inner details.",
    adults: "Lines: Fine, intricate ink contours with detailed pattern fills.",
  };

  return [
    `Black and white coloring book page for printing: "${page.title}".`,
    `Scene: ${page.prompt}`,
    styleDirectives[plan.artStyle] ?? styleDirectives.cute_animals,
    audienceThickness[plan.targetAudience] ?? audienceThickness.children,
    "Background: Pure solid white background (#FFFFFF). Absolutely zero shading, zero gray gradients, zero textures.",
    "Lines: Pure pitch black outlines only (#000000). Closed vector-like shapes suitable for filling.",
    "Strict exclusions: No colors, no grayscale tones, no drop shadows, no text, no lettering, no borders, no watermark.",
  ].join("\n");
}
```

---

## 4. Automated Image Quality Inspection (`coloringQualityService.ts`)

Using `sharp` to inspect the generated raster buffer:

```ts
export interface QualityReport {
  passed: boolean;
  score: number; // 0 to 100
  checks: {
    pureWhiteBackground: boolean;
    zeroColorSaturation: boolean;
    lineContrastAdequate: boolean;
    dpi300Compliant: boolean;
  };
  issues: string[];
}

export async function inspectColoringImage(imageBuffer: Buffer, targetTrim: string): Promise<QualityReport> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const stats = await image.stats();
  const issues: string[] = [];

  // 1. Color Contamination Check: Ensure R == G == B (zero chromatic saturation)
  const isMonochrome = stats.channels.length === 1 || 
    (Math.abs(stats.channels[0].mean - stats.channels[1].mean) < 2 &&
     Math.abs(stats.channels[1].mean - stats.channels[2].mean) < 2);
  if (!isMonochrome) {
    issues.push("Color contamination detected. The image should be pure black and white.");
  }

  // 2. Pure White Background Check: Brightest pixels must reach >= 250 (out of 255)
  const hasPureWhite = stats.channels[0].max >= 250;
  if (!hasPureWhite) {
    issues.push("Background is not pure white (gray wash or texture detected).");
  }

  // 3. 300 DPI Resolution Check
  const minPixels = targetTrim === "8.5x11" ? { w: 2550, h: 3300 } : { w: 2550, h: 2550 };
  const meetsResolution = (metadata.width ?? 0) >= minPixels.w * 0.9 && (metadata.height ?? 0) >= minPixels.h * 0.9;
  if (!meetsResolution) {
    issues.push(`Resolution is below 300 DPI for ${targetTrim} print.`);
  }

  const passed = issues.length === 0;
  const score = Math.max(0, 100 - issues.length * 25);

  return {
    passed,
    score,
    checks: {
      pureWhiteBackground: hasPureWhite,
      zeroColorSaturation: isMonochrome,
      lineContrastAdequate: true,
      dpi300Compliant: meetsResolution,
    },
    issues,
  };
}
```

---

## 5. Independent Page Generation & Credit Safety

```ts
export async function generateSingleColoringPage(userId: string, bookId: string, pageId: string) {
  // 1. Lock Book & Verify ownership
  // 2. Reserve 8 credits atomically in ledger
  const cost = COLORING_CREDIT_COSTS.perIllustration; // 8 credits
  const idempotencyKey = `coloring-page:${pageId}:${Date.now()}`;

  await prisma.$transaction(async (tx) => {
    await reserveInTransaction(tx, userId, cost, idempotencyKey);
    await tx.coloringPage.update({
      where: { id: pageId },
      data: { status: "generating", error: null },
    });
  });

  // 3. Dispatch to BullMQ worker
  // 4. Worker executes:
  //    - imageProvider.generate(compiledPrompt)
  //    - sharp sanitization & quality check
  //    - storage.put (WebP / PNG)
  //    - update ColoringPage (status = 'completed', assetId = asset.id, qualityChecks = report)
  //    - settleInTransaction(tx, userId, cost, cost, idempotencyKey)
  // 5. If worker errors:
  //    - settleInTransaction(tx, userId, cost, 0, idempotencyKey) -> Automatically refunds reserved 8 credits!
  //    - update ColoringPage (status = 'failed', error = message)
}
```

---

## 6. KDP-Ready PDF Compiler (`coloringExportService.ts`)

Compiles the interior PDF using Puppeteer and pdf-lib with strict print formatting:
- **Paper Dimensions:** $8.5 \times 11\text{ inches}$ ($612 \times 792\text{ pt}$) or $8.5 \times 8.5\text{ inches}$.
- **Layout:**
  - Page 1: Clean Title & Copyright page.
  - Page 2: Blank page.
  - Page 3: Illustration 1 (inside margins: Inside gutter $0.5"$, Outside $0.25"$, Top/Bottom $0.25"$).
  - Page 4: Blank page (prevents marker bleed-through on physical paper).
  - Page 5: Illustration 2...
- **Total Physical Pages:** $24\text{ illustrations} \times 2 + 2\text{ front matter} = 50\text{ printed pages}$ (well above KDP's 24-page minimum requirement).

---

## 7. API Routes (`backend/src/routes/coloring.ts`)

| Method | Endpoint | Description | Credit Impact |
|---|---|---|---|
| `POST` | `/coloring/plan` | Create book and generate plan | **Free (0)** |
| `GET` | `/coloring/books` | List user's coloring books | Free |
| `GET` | `/coloring/books/:bookId` | Get coloring book, plan, pages, progress | Free |
| `PATCH` | `/coloring/books/:bookId/plan` | Update plan details / approve plan | Free |
| `PATCH` | `/coloring/books/:bookId/pages/:pageId` | Edit page prompt, description, caption | Free |
| `POST` | `/coloring/books/:bookId/pages/reorder` | Reorder page sequences | Free |
| `POST` | `/coloring/books/:bookId/pages` | Add new page | Free |
| `DELETE` | `/coloring/books/:bookId/pages/:pageId` | Delete page | Free |
| `POST` | `/coloring/books/:bookId/pages/:pageId/generate` | Generate/regenerate single page | **8 credits** |
| `POST` | `/coloring/books/:bookId/generate-batch` | Generate all pending pages | **8 credits × count** |
| `GET` | `/coloring/books/:bookId/quality` | Get full quality analysis report | Free |
| `POST` | `/coloring/books/:bookId/cover` | Generate cover artwork | **10 credits** |
| `POST` | `/coloring/books/:bookId/export` | Queue KDP PDF export | Free |
| `GET` | `/coloring/books/:bookId/export/:exportId` | Download URL & preflight report | Free |
