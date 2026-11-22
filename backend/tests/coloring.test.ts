import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COLORING_CREDIT_COSTS,
  COLORING_STYLE_CATALOG,
  coloringBookBriefSchema,
  estimateColoringCredits,
} from "@ebook/shared";
import { buildColoringPrompt } from "../src/services/coloring/coloringPromptBuilder.js";
import { coloringQualityService } from "../src/services/coloring/coloringQualityService.js";
import { calculateSpine } from "../src/services/coloring/coloringCoverService.js";

describe("Coloring Contracts & Pricing", () => {
  it("computes credit estimates accurately", () => {
    expect(COLORING_CREDIT_COSTS.plan).toBe(0); // 100% free planning
    expect(COLORING_CREDIT_COSTS.perIllustration).toBe(8);
    expect(estimateColoringCredits(24)).toBe(192);
    expect(estimateColoringCredits(30)).toBe(240);
    expect(estimateColoringCredits(40)).toBe(320);
    expect(estimateColoringCredits(50)).toBe(400);
    expect(estimateColoringCredits(60)).toBe(480);
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
    // Create an ideal monochrome line art test image: 1024x1024 white background with black circle
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
    // Image with vibrant red fill
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
    // Image with off-white / light gray background #f0f0f0 and dark gray line #202020
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
