import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Client-side PDF loading and rendering service using PDF.js.
 * Dynamically imports pdfjs-dist in the browser to avoid SSR evaluation issues during Next.js builds.
 */

let pdfjsInstance: typeof import("pdfjs-dist") | null = null;

export async function getPdfJs(): Promise<typeof import("pdfjs-dist") | null> {
  if (typeof window === "undefined") return null;
  if (!pdfjsInstance) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    pdfjsInstance = pdfjs;
  }
  return pdfjsInstance;
}

export interface RenderedPageInfo {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface LoadedPdfBook {
  title?: string;
  totalPages: number;
  pages: RenderedPageInfo[];
  rawBuffer?: ArrayBuffer;
  objectUrl?: string;
}

/**
 * Load a PDF document from an ArrayBuffer, Uint8Array, or URL.
 */
export async function loadPdfDocument(source: ArrayBuffer | Uint8Array | string) {
  const pdfjs = await getPdfJs();
  if (!pdfjs) throw new Error("PDF.js is only available in the browser environment");

  const loadingTask = pdfjs.getDocument(
    typeof source === "string"
      ? { url: source }
      : {
          data: source instanceof ArrayBuffer ? new Uint8Array(source) : source,
        },
  );

  return await loadingTask.promise;
}

/**
 * Render a single PDF page into a high-resolution data URL.
 */
export async function renderPdfPage(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  scale: number = 2.0,
): Promise<RenderedPageInfo> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  // Fill with crisp book paper white before drawing
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    canvas,
  };

  await page.render(renderContext).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  return {
    pageNumber,
    dataUrl,
    width: viewport.width,
    height: viewport.height,
    aspectRatio: viewport.width / viewport.height,
  };
}

/**
 * Render all pages of a PDF document with progress reporting.
 */
export async function renderAllPdfPages(
  pdfDoc: PDFDocumentProxy,
  scale: number = 1.8,
  onProgress?: (current: number, total: number) => void,
): Promise<RenderedPageInfo[]> {
  const total = pdfDoc.numPages;
  const pages: RenderedPageInfo[] = [];

  for (let i = 1; i <= total; i++) {
    const pageInfo = await renderPdfPage(pdfDoc, i, scale);
    pages.push(pageInfo);
    onProgress?.(i, total);
  }

  return pages;
}

/**
 * Request and download a print sample PDF from the backend design preview endpoint.
 */
export async function fetchPrintSamplePdf(bookId: string): Promise<{
  buffer: ArrayBuffer;
  pageCount: number;
  sampleChapters: number;
  partial: boolean;
}> {
  const response = await fetch(`/api/v1/books/${bookId}/design/preview`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "print" }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error?.details?.[0]?.message ??
        data?.error?.message ??
        `Failed to render PDF sample (${response.status})`,
    );
  }

  const pageCount = Number(response.headers.get("X-Page-Count") || 0);
  const sampleChapters = Number(response.headers.get("X-Sample-Chapters") || 0);
  const partial = response.headers.get("X-Sample-Partial") === "true";
  const buffer = await response.arrayBuffer();

  return { buffer, pageCount, sampleChapters, partial };
}

/**
 * Fetch an existing completed PDF export file by exportId.
 */
export async function fetchExportPdf(exportId: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/v1/exports/${exportId}/download`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to download exported PDF (${response.status})`);
  }

  return await response.arrayBuffer();
}
