"use client";

import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import type { BookSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROCEDURAL_PALETTES = [
  { bg: "from-[#0f172a] via-[#1e293b] to-[#020617]", border: "border-sky-500/20", accent: "#38bdf8", tag: "Tech & Science" },
  { bg: "from-[#1c1917] via-[#292524] to-[#0c0a09]", border: "border-amber-500/20", accent: "#f59e0b", tag: "Guide & Non-Fiction" },
  { bg: "from-[#1e1b4b] via-[#312e81] to-[#0f172a]", border: "border-indigo-500/20", accent: "#818cf8", tag: "Fiction & Fantasy" },
  { bg: "from-[#14532d] via-[#166534] to-[#052e16]", border: "border-emerald-500/20", accent: "#4ade80", tag: "Health & Lifestyle" },
  { bg: "from-[#4c0519] via-[#881337] to-[#1f0208]", border: "border-rose-500/20", accent: "#fb7185", tag: "Story & Romance" },
  { bg: "from-[#3b0764] via-[#581c87] to-[#1e1b4b]", border: "border-purple-500/20", accent: "#c084fc", tag: "Creative Arts" },
];

function paletteFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROCEDURAL_PALETTES[h % PROCEDURAL_PALETTES.length];
}

interface EbookCoverProps {
  book: BookSummary;
  className?: string;
  size?: "sm" | "md" | "lg";
  showOverlayText?: boolean;
}

/**
 * Premium ebook cover component inspired by standard published book proportions (~1:1.6).
 * Renders high-resolution cover artwork with left spine shadow, or a high-end
 * procedural fallback cover when no artwork has been generated yet.
 */
export function EbookCover({ book, className, size = "md", showOverlayText = true }: EbookCoverProps) {
  const [imageError, setImageError] = useState(false);
  const palette = paletteFor(book.id);

  const hasArtwork = Boolean(book.coverArtworkId) && !imageError;
  const isColoring = book.bookType === "coloring_book";

  // Aspect ratio 1:1.58 is close to standard Kindle/Amazon ebook ratio (1600x2560)
  return (
    <div
      className={cn(
        "group/cover relative overflow-hidden rounded-xl border border-black/10 bg-zinc-950 transition-all duration-300",
        "aspect-[1/1.55] select-none shadow-md",
        size === "sm" && "w-16 rounded-md",
        size === "md" && "w-full",
        size === "lg" && "w-full max-w-[340px]",
        className
      )}
    >
      {/* Physical Book Spine Illusion (Left edge ambient shadow & highlight) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-1 z-20 w-px bg-white/15" />

      {/* Book Cover Surface */}
      {hasArtwork ? (
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/assets/${encodeURIComponent(book.coverArtworkId!)}/content`}
            alt={book.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/cover:scale-105"
            onError={() => setImageError(true)}
            loading="lazy"
          />

          {/* Subtle top and bottom vignette to enhance typography overlay */}
          {showOverlayText && (
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/20 to-black/40 p-4 text-white">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/90 backdrop-blur-sm">
                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                  {isColoring ? "Coloring Studio" : "eBook"}
                </span>
              </div>

              <div className="space-y-1">
                <p className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-md">
                  {book.title}
                </p>
                {book.author && (
                  <p className="line-clamp-1 text-xs text-white/80 drop-shadow">
                    {book.author}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* High-End Procedural Fallback Cover */
        <div
          className={cn(
            "relative flex h-full w-full flex-col justify-between bg-gradient-to-br p-4 text-white",
            palette.bg
          )}
        >
          {/* Subtle decorative geometry in the background */}
          <div className="pointer-events-none absolute inset-0 opacity-15">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id={`pat-${book.id}`} width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx="15" cy="15" r="1.5" fill="#ffffff" />
                  <path d="M 0 15 L 30 15 M 15 0 L 15 30" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.2" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#pat-${book.id})`} />
            </svg>
          </div>

          {/* Fallback Top Header */}
          <div className="relative z-10 flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-white backdrop-blur-sm"
              style={{ color: palette.accent }}
            >
              <BookOpen className="h-3 w-3" />
              {isColoring ? "Coloring" : palette.tag}
            </span>
          </div>

          {/* Fallback Central Motif */}
          <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center">
            <div
              className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border bg-white/5 backdrop-blur-md shadow-inner"
              style={{ borderColor: `${palette.accent}40`, color: palette.accent }}
            >
              <BookOpen className="h-7 w-7" />
            </div>
            <p className="line-clamp-3 text-base font-extrabold tracking-tight leading-snug drop-shadow-md">
              {book.title}
            </p>
            {book.subtitle && (
              <p className="mt-1 line-clamp-2 text-xs text-white/70">
                {book.subtitle}
              </p>
            )}
          </div>

          {/* Fallback Bottom Author / Meta */}
          <div className="relative z-10 border-t border-white/15 pt-2">
            <p className="line-clamp-1 text-center text-xs font-semibold tracking-wide text-white/90">
              {book.author || "eBookStudio Edition"}
            </p>
          </div>
        </div>
      )}

      {/* Book Soft Right Edge Sheen */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-1.5 bg-gradient-to-l from-black/20 to-transparent" />
    </div>
  );
}
