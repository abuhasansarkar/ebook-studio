import { COLORING_STYLE_CATALOG, type ColoringStyle } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { getOwnedBook } from "../books/bookService.js";
import { notFound } from "../../utils/errors.js";

export interface SpineCalculation {
  interiorPages: number;
  totalPhysicalPages: number;
  spineThicknessInches: number;
  spineThicknessMm: number;
  meetsKdpSpineTextThreshold: boolean; // Amazon requires >= 79 pages for spine text
  singleSided: boolean;
}

export function calculateSpine(pageCount: number, singleSided = true): SpineCalculation {
  // Single-sided printing has 1 blank back page per illustration + 2 pages front matter
  const totalPhysicalPages = singleSided ? pageCount * 2 + 2 : pageCount + 2;
  // KDP white paper formula: page count * 0.002252 inches
  const spineThicknessInches = Number((totalPhysicalPages * 0.002252).toFixed(4));
  const spineThicknessMm = Number((spineThicknessInches * 25.4).toFixed(2));
  const meetsKdpSpineTextThreshold = totalPhysicalPages >= 79;

  return {
    interiorPages: pageCount,
    totalPhysicalPages,
    spineThicknessInches,
    spineThicknessMm,
    meetsKdpSpineTextThreshold,
    singleSided,
  };
}

export const coloringCoverService = {
  async getCoverDetails(userId: string, bookId: string) {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring book plan");

    const cover = await prisma.coverDesign.findFirst({
      where: { bookId },
      orderBy: { version: "desc" },
    });

    const completedPages = await prisma.coloringPage.findMany({
      where: { bookId, status: "completed", assetId: { not: null } },
      orderBy: { pageNumber: "asc" },
      take: 4,
      include: { asset: true },
    });

    const spine = calculateSpine(plan.pageCount, plan.singleSided);

    return {
      book,
      plan,
      cover,
      spine,
      sampleThumbnails: completedPages.map((p) => ({
        pageNumber: p.pageNumber,
        title: p.title,
        assetId: p.assetId,
        storageKey: p.asset?.storageKey,
      })),
    };
  },
};
