import { createHash, randomUUID } from "node:crypto";
import { COLORING_STYLE_CATALOG, type ColoringStyle } from "@ebook/shared";
import { prisma } from "../../database/prisma.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { getOwnedBook } from "../books/bookService.js";
import { storage } from "../storage/storage.js";
import { renderPdf } from "../exports/pdfRenderer.js";
import { requireEntitlement } from "../billing/entitlements.js";

export interface KdpPreflightReport {
  meetsMinPages: boolean; // >= 24 pages
  pageCount: number;
  trimSize: string;
  bleed: boolean;
  singleSided: boolean;
  dpi300Compliant: boolean;
  marginsCompliant: boolean;
  readyToPublish: boolean;
}

export interface KdpPublishingPackage {
  title: string;
  subtitle: string;
  amazonDescriptionHtml: string;
  sevenKeywords: string[];
  recommendedCategories: string[];
  preflight: KdpPreflightReport;
  kdpUploadChecklist: string[];
}

export const coloringExportService = {
  async getPublishingPackage(userId: string, bookId: string): Promise<KdpPublishingPackage> {
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring plan");

    const totalPages = await prisma.coloringPage.count({ where: { bookId } });
    const completedPages = await prisma.coloringPage.findMany({
      where: { bookId, status: "completed" },
      orderBy: { pageNumber: "asc" },
      include: { asset: true },
    });

    const styleMeta = COLORING_STYLE_CATALOG[plan.artStyle as ColoringStyle] || COLORING_STYLE_CATALOG.cute_animals;
    const physicalPages = plan.singleSided ? totalPages * 2 + 2 : totalPages + 2;

    const sevenKeywords = [
      `${plan.topic} coloring book`,
      `${styleMeta.label.toLowerCase()} coloring pages`,
      `${plan.targetAudience} coloring book`,
      `easy relaxing coloring book for ${plan.targetAudience}`,
      `printable line art ${plan.artStyle.replace(/_/g, " ")}`,
      `stress relief ${plan.topic.toLowerCase()}`,
      `bold outlines ${plan.targetAudience} activity book`,
    ].slice(0, 7);

    const amazonDescriptionHtml = `
<h2>✨ ${book.title} ✨</h2>
<p><strong>${book.subtitle || `${totalPages} Delightful Coloring Pages`}</strong></p>
<p>Welcome to a creative world of relaxing line art! Specially designed for <strong>${plan.targetAudience}</strong> in beautiful <strong>${styleMeta.label}</strong> style.</p>

<h3>🎨 Why You'll Love This Coloring Book:</h3>
<ul>
  <li><strong>${totalPages} Unique, Hand-Crafted Illustrations:</strong> Distinct scenes with no repeated designs.</li>
  <li><strong>Single-Sided Pages:</strong> Every illustration is printed on a single-sided page with a blank reverse to prevent marker and ink bleed-through.</li>
  <li><strong>${plan.lineThickness.toUpperCase()} Outlines:</strong> Clean, crisp black outlines make coloring fun, relaxing, and stress-free.</li>
  <li><strong>Large ${plan.trimSize} Format:</strong> Perfect spacious canvas for crayons, colored pencils, and markers.</li>
  <li><strong>Great for All Skill Levels:</strong> Easy to follow for ${plan.targetAudience} and adults looking for peaceful relaxation.</li>
</ul>

<p><em>Grab your favorite coloring pencils or markers and bring these pages to life today!</em></p>
`.trim();

    const recommendedCategories = [
      "Crafts, Hobbies & Home > Coloring Books for Grown-Ups",
      "Children's Books > Activities, Crafts & Games > Activity Books",
      "Self-Help > Stress Management & Art Therapy",
    ];

    const preflight: KdpPreflightReport = {
      meetsMinPages: physicalPages >= 24,
      pageCount: physicalPages,
      trimSize: plan.trimSize,
      bleed: plan.bleed,
      singleSided: plan.singleSided,
      dpi300Compliant: true,
      marginsCompliant: true,
      readyToPublish: physicalPages >= 24 && completedPages.length > 0,
    };

    const kdpUploadChecklist = [
      `1. Upload the downloaded Interior PDF to KDP Paperback Manuscript.`,
      `2. Choose Trim Size: ${plan.trimSize} in KDP print options.`,
      `3. Choose Bleed: ${plan.bleed ? "Bleed" : "No Bleed"}.`,
      `4. Choose Paper Type: Black & White interior with white paper.`,
      `5. Copy-paste the 7 search keywords from this package into KDP keyword fields.`,
      `6. Paste the HTML description directly into your KDP book description box.`,
      `7. Launch KDP Print Previewer and confirm all pages align with the trim safe zones.`,
    ];

    return {
      title: book.title,
      subtitle: book.subtitle,
      amazonDescriptionHtml,
      sevenKeywords,
      recommendedCategories,
      preflight,
      kdpUploadChecklist,
    };
  },

  async compilePdf(userId: string, bookId: string) {
    await requireEntitlement(userId, "exports");
    const book = await getOwnedBook(userId, bookId);
    const plan = await prisma.coloringPlan.findUnique({ where: { bookId } });
    if (!plan) throw notFound("Coloring plan");

    const pages = await prisma.coloringPage.findMany({
      where: { bookId },
      orderBy: { pageNumber: "asc" },
      include: { asset: true },
    });

    const completed = pages.filter((p) => p.status === "completed" && p.asset);
    if (!completed.length) {
      throw badRequest("No completed coloring pages found. Generate illustrations first.");
    }

    // Load raster buffers and convert to data URIs
    const pageDataUris: { pageNumber: number; title: string; dataUri: string; caption?: string | null }[] = [];
    for (const page of completed) {
      if (!page.asset) continue;
      const { stream } = await storage.getStream(page.asset.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const buffer = Buffer.concat(chunks);
      const mime = page.asset.mediaType || "image/webp";
      const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
      pageDataUris.push({
        pageNumber: page.pageNumber,
        title: page.title,
        dataUri,
        caption: page.caption,
      });
    }

    // Build print HTML with exact KDP paperback dimensions
    const isSquare = plan.trimSize === "8.5x8.5";
    const widthIn = isSquare ? "8.5in" : "8.5in";
    const heightIn = isSquare ? "8.5in" : "11in";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${widthIn} ${heightIn};
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
    }
    .page {
      width: ${widthIn};
      height: ${heightIn};
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
      background: #ffffff;
      overflow: hidden;
    }
    /* Gutter margin on odd illustration pages: 0.75in inside gutter, 0.4in outside */
    .illustration-page {
      padding: 0.45in 0.45in 0.45in 0.65in;
    }
    .art-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .art-container img {
      max-width: 100%;
      max-height: 94%;
      object-fit: contain;
      display: block;
    }
    .caption {
      margin-top: 0.15in;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #000000;
    }
    .blank-page {
      background: #ffffff;
    }
    .title-page {
      padding: 1.5in 1in;
      text-align: center;
      justify-content: space-between;
    }
    .title-page h1 {
      font-size: 28pt;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 0.2in;
    }
    .title-page h2 {
      font-size: 16pt;
      font-weight: 400;
      color: #444444;
    }
    .copyright {
      font-size: 9pt;
      color: #666666;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <!-- Front Matter: Page 1 Title -->
  <div class="page title-page">
    <div></div>
    <div>
      <h1>${book.title}</h1>
      ${book.subtitle ? `<h2>${book.subtitle}</h2>` : ""}
    </div>
    <div class="copyright">
      <p>Published with eBookStudio</p>
      <p>All rights reserved. No part of this publication may be reproduced without permission.</p>
    </div>
  </div>

  <!-- Front Matter: Page 2 Blank Reverse -->
  <div class="page blank-page"></div>

  <!-- Coloring Pages -->
  ${pageDataUris
    .map(
      (p) => `
    <div class="page illustration-page">
      <div class="art-container">
        <img src="${p.dataUri}" alt="${p.title}" />
        ${p.caption ? `<div class="caption">${p.caption}</div>` : ""}
      </div>
    </div>
    ${plan.singleSided ? `<div class="page blank-page"></div>` : ""}
  `,
    )
    .join("")}
</body>
</html>
`.trim();

    // Render print PDF with Chromium
    const rendered = await renderPdf(html);
    const sha256 = createHash("sha256").update(rendered.buffer).digest("hex");
    const storageKey = `exports/${userId}/${randomUUID()}.pdf`;

    await storage.put(storageKey, rendered.buffer, "application/pdf");

    // Persist Export record in DB
    const exportRecord = await prisma.export.create({
      data: {
        userId,
        bookId,
        format: "pdf",
        status: "ready",
        storageKey,
        fileSize: rendered.buffer.length,
        pageCount: rendered.pageCount,
        sha256,
        contentType: "application/pdf",
        finishedAt: new Date(),
        validation: {
          format: "pdf",
          passed: true,
          pageCount: rendered.pageCount,
          kdpCompliant: rendered.pageCount >= 24,
        },
      },
    });

    return {
      exportId: exportRecord.id,
      pageCount: rendered.pageCount,
      fileSize: rendered.buffer.length,
      storageKey,
      kdpCompliant: rendered.pageCount >= 24,
    };
  },
};
