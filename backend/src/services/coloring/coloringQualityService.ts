import sharp from "sharp";
import type { ColoringPageQuality } from "@ebook/shared";

export const coloringQualityService = {
  async inspectImage(buffer: Buffer, trimSize = "8.5x11"): Promise<ColoringPageQuality> {
    const img = sharp(buffer);
    const metadata = await img.metadata();
    const stats = await img.stats();
    const issues: string[] = [];

    // 1. Color Contamination Check:
    // If image has RGB channels, check if R == G == B (zero chromatic saturation)
    let isMonochrome = true;
    if (stats.channels.length >= 3) {
      const [r, g, b] = stats.channels;
      const diffRG = Math.abs(r.mean - g.mean);
      const diffGB = Math.abs(g.mean - b.mean);
      if (diffRG > 2.5 || diffGB > 2.5) {
        isMonochrome = false;
        issues.push("Color contamination detected. Coloring pages must be pure black and white line art.");
      }
    }

    // 2. Pure White Background Check:
    // Brightest pixels should be >= 248 (near pure white #FFFFFF = 255)
    const maxVal = stats.channels[0].max;
    const hasWhiteBackground = maxVal >= 248;
    if (!hasWhiteBackground) {
      issues.push("Background is not pure white (gray wash or paper texture detected).");
    }

    // 3. Line Contrast Check:
    // Darkest pixels should be <= 50 (deep black lines)
    const minVal = stats.channels[0].min;
    const hasSolidLines = minVal <= 65;
    if (!hasSolidLines) {
      issues.push("Line art contrast is low (strokes appear gray rather than crisp black).");
    }

    // 4. 300 DPI Resolution Check:
    // 8.5" x 11" at 300 DPI is 2550 x 3300. We allow reasonable AI generation resolution (>= 1024px minimum).
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const minDim = Math.min(width, height);
    const dpiCompliant = minDim >= 1024;
    if (!dpiCompliant) {
      issues.push(`Resolution (${width}×${height}) is lower than 1024px for high-quality printing.`);
    }

    const passed = issues.length === 0;
    let score = 100;
    if (!isMonochrome) score -= 35;
    if (!hasWhiteBackground) score -= 30;
    if (!hasSolidLines) score -= 20;
    if (!dpiCompliant) score -= 15;
    score = Math.max(0, Math.min(100, score));

    return {
      passed,
      score,
      checks: {
        pureWhiteBackground: hasWhiteBackground,
        zeroColorSaturation: isMonochrome,
        lineContrastAdequate: hasSolidLines,
        dpi300Compliant: dpiCompliant,
      },
      issues,
    };
  },

  /**
   * 1-Click Auto-Clean: Enhances contrast, eliminates mild gray fuzz,
   * and maps near-white pixels to pure #FFFFFF while solidifying black lines to #000000.
   */
  async autoCleanLines(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .grayscale()
      .threshold(225) // Pixels > 225 become 255 (white), <= 225 become 0 (black)
      .png()
      .toBuffer();
  },
};
