import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COLORING_CREDIT_COSTS,
  COLORING_STYLE_CATALOG,
  coloringBookBriefSchema,
  estimateColoringCredits,
} from "@ebook/shared";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { buildColoringPrompt } from "../src/services/coloring/coloringPromptBuilder.js";
import { coloringQualityService } from "../src/services/coloring/coloringQualityService.js";
import { calculateSpine } from "../src/services/coloring/coloringCoverService.js";
import { createUser, grantEntitlements, ORIGIN } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("Coloring Contracts & Pricing", () => {
  it("computes credit estimates accurately", () => {
    expect(COLORING_CREDIT_COSTS.plan).toBe(10); // Standard 10 credits for planning
    expect(COLORING_CREDIT_COSTS.perIllustration).toBe(8);
    expect(COLORING_CREDIT_COSTS.cover).toBe(10);
    expect(estimateColoringCredits(24)).toBe(202);
    expect(estimateColoringCredits(30)).toBe(250);
    expect(estimateColoringCredits(40)).toBe(330);
    expect(estimateColoringCredits(50)).toBe(410);
    expect(estimateColoringCredits(60)).toBe(490);
  });

  it("validates brief schema and applies defaults", () => {
    const brief = coloringBookBriefSchema.parse({
      topic: "Cute farm animals having little adventures",
    });
    expect(brief.artStyle).toBe("kawaii_chibi");
    expect(brief.pageCount).toBe(24);
    expect(brief.singleSided).toBe(true);
    expect(brief.trimSize).toBe("8.5x11");
    expect(brief.lineThickness).toBe("medium");
  });

  it("catalogs all 12 visual coloring styles", () => {
    expect(Object.keys(COLORING_STYLE_CATALOG).length).toBe(12);
    expect(COLORING_STYLE_CATALOG.kawaii_chibi.label).toBe("Kawaii Chibi");
    expect(COLORING_STYLE_CATALOG.mandala_patterns.label).toBe("Mandala & Patterns");
    expect(COLORING_STYLE_CATALOG.bold_easy.label).toBe("Bold & Easy");
    expect(COLORING_STYLE_CATALOG.cute_animals.label).toBe("Cute Animals");
    expect(COLORING_STYLE_CATALOG.dinosaurs.label).toBe("Dinosaurs");
    expect(COLORING_STYLE_CATALOG.ocean_sea_life.label).toBe("Ocean & Sea Life");
  });
});

describe("Coloring Prompt Builder", () => {
  it("enforces strict line art constraints and style directives", () => {
    const prompt = buildColoringPrompt({
      title: "Farm Animals",
      topic: "Farm animals having adventures",
      artStyle: "kawaii_chibi",
      targetAudience: "children",
      difficulty: "easy",
      lineThickness: "thick",
      sceneTitle: "Playful Piglet",
      scenePrompt: "A cute little pig playing in mud beside a wooden barn fence.",
    });

    expect(prompt).toContain("Black and white coloring book illustration");
    expect(prompt).toContain("Playful Piglet");
    expect(prompt).toContain("Kawaii Chibi");
    expect(prompt).toContain("Solid, pure white paper background (#FFFFFF)");
    expect(prompt).toContain("No colors, no colored pixels, no grayscale shading");
    expect(prompt).toContain("No text, no letters, no words");
  });

  it("applies preschool ultra-thick line directives", () => {
    const prompt = buildColoringPrompt({
      title: "Toddler Animals",
      topic: "Baby animals",
      artStyle: "bold_easy",
      targetAudience: "preschool",
      difficulty: "very_easy",
      lineThickness: "thick",
      sceneTitle: "Happy Cow",
      scenePrompt: "A happy baby cow sitting in grass.",
    });

    expect(prompt).toContain("Ultra-thick, bold black outlines");
    expect(prompt).toContain("Bold & Easy");
  });
});

describe("Coloring Quality Service", () => {
  it("detects pure black-and-white line art accurately", async () => {
    const svg = `
      <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff" />
        <circle cx="512" cy="512" r="300" fill="none" stroke="#000000" stroke-width="8" />
      </svg>
    `;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const quality = await coloringQualityService.inspectImage(buffer, "8.5x11");

    expect(quality.passed).toBe(true);
    expect(quality.checks.pureWhiteBackground).toBe(true);
    expect(quality.checks.zeroColorSaturation).toBe(true);
    expect(quality.checks.dpi300Compliant).toBe(true);
    expect(quality.score).toBe(100);
  });

  it("flags color contamination", async () => {
    const svg = `
      <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff" />
        <circle cx="512" cy="512" r="300" fill="#ff0000" />
      </svg>
    `;
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const quality = await coloringQualityService.inspectImage(buffer, "8.5x11");

    expect(quality.passed).toBe(false);
    expect(quality.checks.zeroColorSaturation).toBe(false);
    expect(quality.issues).toContain("Color contamination detected. Coloring pages must be pure black and white line art.");
  });

  it("auto-cleans line art using threshold enhancement", async () => {
    const svg = `
      <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f4f4f4" />
        <line x1="100" y1="100" x2="900" y2="900" stroke="#222222" stroke-width="10" />
      </svg>
    `;
    const dirtyBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const cleanedBuffer = await coloringQualityService.autoCleanLines(dirtyBuffer);
    const quality = await coloringQualityService.inspectImage(cleanedBuffer, "8.5x11");

    expect(quality.checks.pureWhiteBackground).toBe(true);
    expect(quality.checks.zeroColorSaturation).toBe(true);
  });
});

describe("KDP Spine Math", () => {
  it("calculates exact spine thickness for paperback interiors", () => {
    // 24 interior pages, single-sided (24 * 2 + 2 front matter = 50 physical pages)
    const spine24 = calculateSpine(24, true);
    expect(spine24.totalPhysicalPages).toBe(50);
    // 50 * 0.002252 = 0.1126 inches
    expect(spine24.spineThicknessInches).toBe(0.1126);
    expect(spine24.meetsKdpSpineTextThreshold).toBe(false); // < 79 pages

    // 40 interior pages, single-sided (40 * 2 + 2 = 82 physical pages)
    const spine40 = calculateSpine(40, true);
    expect(spine40.totalPhysicalPages).toBe(82);
    // 82 * 0.002252 = 0.1847 inches
    expect(spine40.spineThicknessInches).toBe(0.1847);
    expect(spine40.meetsKdpSpineTextThreshold).toBe(true); // >= 79 pages (allows spine title text)
  });
});

describe("AI Coloring Studio End-to-End API Integration", () => {
  it("rejects plan generation when user has insufficient credits", async () => {
    const { user, agent } = await createUser("coloring-poor-user");
    await prisma.creditWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: 5 },
      update: { balance: 5 },
    });

    const res = await agent
      .post("/api/v1/coloring/plan")
      .set("Origin", ORIGIN)
      .send({
        topic: "Cute baby animals exploring a sunny flower meadow",
        artStyle: "kawaii_chibi",
        targetAudience: "children",
        difficulty: "easy",
        lineThickness: "medium",
        trimSize: "8.5x11",
        singleSided: true,
        pageCount: 24,
      });

    expect(res.status).toBe(402);
  });

  it("runs full lifecycle: create plan (10 credits), reorder, generate page, clean, cover, and export", async () => {
    const { user, agent } = await createUser("coloring-test-user");

    // Grant 150 credits to wallet for generation tests
    await prisma.creditWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: 150 },
      update: { balance: 150 },
    });
    await grantEntitlements(user.id, { exports: true });

    // 1. Create Coloring Book Plan (Deducts 10 credits)
    const createRes = await agent
      .post("/api/v1/coloring/plan")
      .set("Origin", ORIGIN)
      .send({
        topic: "Cute baby animals exploring a sunny flower meadow",
        artStyle: "kawaii_chibi",
        targetAudience: "children",
        difficulty: "easy",
        lineThickness: "medium",
        trimSize: "8.5x11",
        singleSided: true,
        pageCount: 24,
      })
      .expect(201);

    expect(createRes.body.book).toBeDefined();
    expect(createRes.body.plan).toBeDefined();
    expect(createRes.body.pages).toHaveLength(24);

    const bookId = createRes.body.book.id;

    // Verify wallet balance reflects 10 credits deducted (150 - 10 = 140)
    const walletAfterPlan = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(walletAfterPlan?.balance).toBe(140);

    // 2. List User Coloring Books
    const listRes = await agent.get("/api/v1/coloring/books").set("Origin", ORIGIN).expect(200);
    expect(listRes.body.books.some((b: { id: string }) => b.id === bookId)).toBe(true);

    // 3. Get Coloring Book Details
    const detailRes = await agent.get(`/api/v1/coloring/books/${bookId}`).set("Origin", ORIGIN).expect(200);
    expect(detailRes.body.stats.total).toBe(24);
    expect(detailRes.body.stats.pending).toBe(24);
    expect(detailRes.body.stats.completed).toBe(0);

    // 4. Update and Approve Plan
    const patchPlanRes = await agent
      .patch(`/api/v1/coloring/books/${bookId}/plan`)
      .set("Origin", ORIGIN)
      .send({
        title: "Enchanted Animals Coloring Book",
        approved: true,
      })
      .expect(200);
    expect(patchPlanRes.body.plan.approvedAt).toBeDefined();

    // 5. Reorder Pages atomically
    const firstTwo = [detailRes.body.pages[1].id, detailRes.body.pages[0].id, ...detailRes.body.pages.slice(2).map((p: { id: string }) => p.id)];
    const reorderRes = await agent
      .post(`/api/v1/coloring/books/${bookId}/pages/reorder`)
      .set("Origin", ORIGIN)
      .send({ pageIds: firstTwo })
      .expect(200);
    expect(reorderRes.body.pages[0].id).toBe(detailRes.body.pages[1].id);
    expect(reorderRes.body.pages[0].pageNumber).toBe(1);

    // 6. Add a page
    const addPageRes = await agent
      .post(`/api/v1/coloring/books/${bookId}/pages`)
      .set("Origin", ORIGIN)
      .send({
        title: "Bonus Baby Bunny",
        prompt: "A joyful baby bunny hopping over fresh spring clover flowers.",
      })
      .expect(201);
    expect(addPageRes.body.page.pageNumber).toBe(25);

    // 7. Delete a page
    const deletePageRes = await agent
      .delete(`/api/v1/coloring/books/${bookId}/pages/${addPageRes.body.page.id}`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(deletePageRes.body.remainingCount).toBe(24);

    // 8. Generate Single Page (Charges exactly 8 credits)
    const targetPage = detailRes.body.pages[0];
    const genPageRes = await agent
      .post(`/api/v1/coloring/books/${bookId}/pages/${targetPage.id}/generate`)
      .set("Origin", ORIGIN)
      .send({ promptOverride: "A smiling baby duck with flowers." })
      .expect(200);

    expect(genPageRes.body.page.status).toBe("completed");
    expect(genPageRes.body.page.assetId).toBeDefined();

    // Verify 8 credits deducted for page generation (150 - 10 - 8 = 132)
    const walletAfterPage = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(walletAfterPage?.balance).toBe(150 - 10 - 8);

    // 9. Auto-clean line art on generated page
    const cleanRes = await agent
      .post(`/api/v1/coloring/books/${bookId}/pages/${targetPage.id}/clean`)
      .set("Origin", ORIGIN)
      .expect(200);

    expect(cleanRes.body.page.assetId).toBeDefined();
    expect(cleanRes.body.page.qualityChecks?.passed).toBe(true);

    // 10. Generate Full-Color Cover (Charges 10 credits)
    const coverGenRes = await agent
      .post(`/api/v1/coloring/books/${bookId}/cover`)
      .set("Origin", ORIGIN)
      .send({
        titleOverride: "Enchanted Meadow Coloring Book",
        authorOverride: "Jane Studio",
      })
      .expect(200);

    expect(coverGenRes.body.cover).toBeDefined();
    expect(coverGenRes.body.asset).toBeDefined();

    // Verify 10 credits deducted for cover (total: 150 - 10 - 8 - 10 = 122)
    const walletAfterCover = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(walletAfterCover?.balance).toBe(122);

    // 11. Get Cover Details & Spine
    const coverDetailsRes = await agent.get(`/api/v1/coloring/books/${bookId}/cover`).set("Origin", ORIGIN).expect(200);
    expect(coverDetailsRes.body.spine.totalPhysicalPages).toBe(50); // 24 * 2 + 2
    expect(coverDetailsRes.body.coverArtworkAsset).toBeDefined();

    // 12. Quality Audit
    const qualityRes = await agent.get(`/api/v1/coloring/books/${bookId}/quality`).set("Origin", ORIGIN).expect(200);
    expect(qualityRes.body.stats.completed).toBe(1);

    // 13. Publishing Package & KDP Metadata
    const pkgRes = await agent.get(`/api/v1/coloring/books/${bookId}/export/package`).set("Origin", ORIGIN).expect(200);
    expect(pkgRes.body.sevenKeywords).toHaveLength(7);
    expect(pkgRes.body.amazonDescriptionHtml).toContain("✨");
    expect(pkgRes.body.preflight.meetsMinPages).toBe(true);

    const mdRes = await agent.get(`/api/v1/coloring/books/${bookId}/export/metadata`).set("Origin", ORIGIN).expect(200);
    expect(mdRes.text).toContain("Amazon KDP Publishing Package");
    expect(mdRes.text).toContain("Amazon Search Keywords");

    // 14. PDF Compilation (Puppeteer print PDF with single-sided blank backs)
    const compileRes = await agent.post(`/api/v1/coloring/books/${bookId}/export/compile`).set("Origin", ORIGIN).expect(200);
    expect(compileRes.body.exportId).toBeDefined();
    expect(compileRes.body.fileSize).toBeGreaterThan(100);
  });
});
