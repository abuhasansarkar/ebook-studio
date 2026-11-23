"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Feather, Volume2, VolumeX, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookDetail, ChapterFull, ChapterMeta } from "@/lib/types";

export interface FlipBookHandle {
  flipNext: () => void;
  flipPrev: () => void;
  flipToSpread: (spreadIndex: number) => void;
  getCurrentSpread: () => number;
}

interface EBookFlipBookProps {
  book: BookDetail;
  chapters: ChapterMeta[];
  currentSpread: number;
  onSpreadChange: (spread: number) => void;
  chapterDetails?: Record<string, ChapterFull>;
  paperTone?: "cream" | "white" | "sepia";
}

// Realistic zero-dependency synthetic paper rustle sound via Web Audio API
function playPaperTurnSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const bufferSize = Math.floor(ctx.sampleRate * 0.15); // 150ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(650, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.onended = () => {
      try {
        void ctx.close();
      } catch {}
    };
  } catch {}
}

/**
 * Extracts plain-text paragraphs from a TipTap / ProseMirror document JSON
 */
function extractParagraphs(node: any): string[] {
  if (!node) return [];
  if (node.type === "paragraph" || node.type === "heading") {
    const text = extractText(node);
    return text.trim() ? [text.trim()] : [];
  }
  if (Array.isArray(node.content)) {
    return node.content.flatMap(extractParagraphs);
  }
  return [];
}

function extractText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join("");
  }
  return "";
}

/**
 * Render individual page content (Left or Right) matching the physical book layout
 */
function PageSurface({
  side,
  book,
  chapters,
  spreadIndex,
  totalSpreads,
  chapterDetails,
  paperTone = "cream",
  onJumpToSpread,
}: {
  side: "left" | "right";
  book: BookDetail;
  chapters: ChapterMeta[];
  spreadIndex: number;
  totalSpreads: number;
  chapterDetails?: Record<string, ChapterFull>;
  paperTone?: "cream" | "white" | "sepia";
  onJumpToSpread?: (spread: number) => void;
}) {
  const isTitleSpread = spreadIndex === 0;
  const isMatterSpread = spreadIndex === 1;
  const isBackMatterSpread = spreadIndex === totalSpreads - 1;
  const isChapterSpread = !isTitleSpread && !isMatterSpread && !isBackMatterSpread;
  const chapterIdx = isChapterSpread ? spreadIndex - 2 : -1;
  const chapter = chapterIdx >= 0 && chapterIdx < chapters.length ? chapters[chapterIdx] : null;

  // Calculate physical book page numbers
  const leftPageNum = spreadIndex * 2 + 1;
  const rightPageNum = spreadIndex * 2 + 2;

  // Paper tone styling
  const toneBg =
    paperTone === "sepia"
      ? "bg-[#fbf4e8] text-[#2c2621]"
      : paperTone === "white"
        ? "bg-[#ffffff] text-neutral-900"
        : "bg-[#fcfbf9] text-neutral-850";

  // Check if we have written content for this chapter
  const fullDetail = chapter ? chapterDetails?.[chapter.id] : null;
  const writtenParagraphs = fullDetail?.contentJson ? extractParagraphs(fullDetail.contentJson) : [];
  const outlineChapter = book.outline?.data?.chapters?.[chapterIdx];

  // ==========================================
  // LEFT PAGE RENDERING
  // ==========================================
  if (side === "left") {
    return (
      <div
        className={cn(
          "relative h-full w-full flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden rounded-l-2xl border-y border-l border-neutral-300/80 border-r-[6px] border-[#161617] shadow-xs",
          toneBg,
        )}
      >
        {/* Spine Depth Shadow on Right edge */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 bg-gradient-to-l from-black/25 via-black/5 to-transparent z-10" />

        {isTitleSpread ? (
          // SPREAD 0 LEFT: Cover Artwork / Half-Title Frontispiece
          book.coverArtworkId ? (
            <div className="flex flex-col items-center justify-center h-full p-2">
              <div className="relative max-h-[460px] w-auto max-w-full overflow-hidden rounded-lg shadow-xl border border-neutral-300/60 bg-neutral-900">
                <img
                  src={`/api/v1/assets/${book.coverArtworkId}/view`}
                  alt={book.title}
                  className="max-h-[440px] w-auto object-contain"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
              </div>
              <span className="mt-3 text-[10px] font-mono tracking-widest text-neutral-400 uppercase">
                Front Cover Artwork
              </span>
            </div>
          ) : (
            <>
              <div className="text-right text-[10px] font-mono text-neutral-400 tracking-widest uppercase">
                Half-Title
              </div>
              <div className="flex flex-col items-center justify-center text-center px-4 my-auto">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Feather className="h-6 w-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-neutral-900 tracking-tight leading-tight">
                  {book?.title}
                </h2>
                {book?.subtitle && (
                  <p className="mt-2 text-xs sm:text-sm font-serif italic text-neutral-600 max-w-xs">
                    {book.subtitle}
                  </p>
                )}
                <div className="mt-6 h-0.5 w-12 bg-neutral-300 mx-auto" />
              </div>
              <div className="flex items-end justify-between text-neutral-400 text-[10px] pt-4 border-t border-neutral-200/80 font-mono">
                <span>eBookStudio Editions</span>
                <span>Page 1</span>
              </div>
            </>
          )
        ) : isMatterSpread ? (
          // SPREAD 1 LEFT: Copyright & Legal Matter
          <>
            <div className="text-left text-[10px] font-mono text-neutral-400 tracking-widest uppercase">
              Matter & Colophon
            </div>
            <div className="flex flex-col justify-center my-auto space-y-4 px-2 sm:px-4 text-[11px] sm:text-xs text-neutral-600 leading-relaxed font-serif">
              <p className="font-bold text-neutral-900 font-sans text-xs sm:text-sm">
                {book.title}
              </p>
              <p>
                Copyright © {new Date().getFullYear()} {book.brief?.authorName || "Author"}.
                <br />
                All rights reserved.
              </p>
              <p className="text-[10px] sm:text-[11px] text-neutral-500">
                No part of this publication may be reproduced, stored in a retrieval system, or transmitted in any form or by any means, electronic, mechanical, photocopying, recording, or otherwise, without prior written permission from the publisher.
              </p>
              <div className="pt-2 text-[10px] font-mono text-neutral-400 space-y-0.5">
                <p>First Edition • {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}</p>
                <p>Published with eBookStudio Publishing Platform</p>
                <p>Typeset in Serif Book Pro • {book.language.toUpperCase()}</p>
              </div>
              <div className="pt-4 border-t border-neutral-200/70 italic text-neutral-500 text-xs">
                &ldquo;For readers everywhere who explore new horizons through the power of written knowledge.&rdquo;
              </div>
            </div>
            <div className="flex items-end justify-between text-neutral-400 text-[10px] pt-4 border-t border-neutral-200/80 font-mono">
              <span>Page {leftPageNum}</span>
              <span>Legal / Copyright</span>
            </div>
          </>
        ) : isChapterSpread && chapter ? (
          // SPREAD N LEFT: Chapter Opening Page
          <>
            {/* Running Header */}
            <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 text-[10px] font-mono text-neutral-400">
              <span className="truncate font-serif italic text-neutral-600 max-w-[70%]">{book.title}</span>
              <span className="uppercase tracking-wider">Chapter {chapter.position + 1}</span>
            </div>

            {/* Chapter Opening Body */}
            <div className="flex-1 my-auto overflow-y-auto py-4 sm:py-6 space-y-4 font-serif text-xs sm:text-sm text-neutral-800 leading-relaxed">
              <div className="mb-4">
                <span className="text-[10px] sm:text-xs font-mono font-semibold tracking-widest uppercase text-primary block mb-1">
                  CHAPTER {chapter.position + 1}
                </span>
                <h1 className="text-xl sm:text-2xl font-serif font-bold text-neutral-900 tracking-tight leading-snug">
                  {chapter.title}
                </h1>
                <div className="mt-2.5 h-0.5 w-10 bg-primary/60" />
              </div>

              {writtenParagraphs.length > 0 ? (
                // Real Written Paragraphs
                <div className="space-y-3">
                  <p className="first-letter:float-left first-letter:text-3xl first-letter:font-serif first-letter:font-bold first-letter:mr-2 first-letter:leading-none first-letter:text-primary">
                    {writtenParagraphs[0]}
                  </p>
                  {writtenParagraphs.slice(1, 3).map((p, idx) => (
                    <p key={idx} className="indent-4">
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                // Manuscript Draft / Outline Summary
                <div className="space-y-3 rounded-xl border border-neutral-200/70 bg-black/[0.02] p-4 text-xs font-sans">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    <span>Chapter Overview & Blueprint</span>
                  </div>
                  {chapter.goal && (
                    <p className="font-serif italic text-neutral-700 leading-relaxed text-xs">
                      &ldquo;{chapter.goal}&rdquo;
                    </p>
                  )}
                  {outlineChapter?.goal && outlineChapter.goal !== chapter.goal && (
                    <p className="text-neutral-600 leading-relaxed">
                      {outlineChapter.goal}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 text-[10px] font-mono text-neutral-400">
                    <span>Target: {chapter.targetWords || 2000} words</span>
                    <span>Status: {chapter.status.toUpperCase()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-end justify-between border-t border-neutral-200/80 pt-2 text-neutral-400 text-[10px] font-mono">
              <span>Page {leftPageNum}</span>
              <span className="truncate max-w-[60%] font-serif italic">{chapter.title}</span>
            </div>
          </>
        ) : (
          // SPREAD FINAL LEFT: About the Author
          <>
            <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 text-[10px] font-mono text-neutral-400">
              <span className="truncate font-serif italic text-neutral-600">{book.title}</span>
              <span className="uppercase tracking-wider">Back Matter</span>
            </div>

            <div className="flex-1 my-auto overflow-y-auto py-4 space-y-3 font-serif text-xs sm:text-sm text-neutral-800 leading-relaxed">
              <span className="text-[10px] font-mono font-semibold tracking-widest uppercase text-primary block">
                ABOUT THE AUTHOR
              </span>
              <h2 className="text-lg sm:text-xl font-bold font-serif text-neutral-900">
                {book.brief?.authorName || "The Author"}
              </h2>
              <div className="h-0.5 w-8 bg-neutral-300" />
              <p className="text-neutral-700 leading-relaxed">
                {`${book.brief?.authorName || "The author"} is a passionate writer and domain expert dedicated to crafting engaging, high-impact books. Produced and typeset through the eBookStudio publishing suite.`}
              </p>
              {(book.brief?.purpose || book.brief?.topic) && (
                <div className="mt-3 p-3 rounded-lg bg-black/[0.02] border border-neutral-200/70 text-xs font-sans text-neutral-600">
                  <p className="font-semibold text-neutral-800 mb-1">Book Premise:</p>
                  <p className="italic line-clamp-4">{book.brief.purpose || book.brief.topic}</p>
                </div>
              )}
            </div>

            <div className="flex items-end justify-between border-t border-neutral-200/80 pt-2 text-neutral-400 text-[10px] font-mono">
              <span>Page {leftPageNum}</span>
              <span>Author Biography</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // RIGHT PAGE RENDERING
  // ==========================================
  return (
    <div
      className={cn(
        "relative h-full w-full flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden rounded-r-2xl border-y border-r border-neutral-300/80 border-l-[6px] border-[#161617] shadow-xs",
        toneBg,
      )}
    >
      {/* Spine Depth Shadow on Left edge */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-16 bg-gradient-to-r from-black/25 via-black/5 to-transparent z-10" />

      {isTitleSpread ? (
        // SPREAD 0 RIGHT: Full Title Page
        <>
          <div className="text-right text-[10px] font-mono text-neutral-400 tracking-widest uppercase">
            Title Page
          </div>
          <div className="flex flex-col items-center justify-center text-center my-auto px-4">
            <h1 className="text-2xl sm:text-4xl font-serif font-black text-neutral-950 tracking-tight leading-tight">
              {book.title}
            </h1>
            {book.subtitle && (
              <p className="mt-3 text-xs sm:text-base font-serif italic text-neutral-600 max-w-sm leading-relaxed">
                {book.subtitle}
              </p>
            )}
            <div className="my-6 h-0.5 w-16 bg-primary mx-auto" />
            <p className="text-xs sm:text-sm font-sans font-semibold tracking-wide text-neutral-700 uppercase">
              By {book.brief?.authorName || "Author"}
            </p>
            {book.brief?.targetAudience && (
              <span className="mt-2 text-[10px] font-mono text-neutral-400">
                Audience: {book.brief.targetAudience}
              </span>
            )}
          </div>
          <div className="flex items-end justify-between text-neutral-400 text-[10px] pt-4 border-t border-neutral-200/80 font-mono">
            <span>eBookStudio Imprint</span>
            <span>Page 2</span>
          </div>
        </>
      ) : isMatterSpread ? (
        // SPREAD 1 RIGHT: Interactive Table of Contents
        <>
          <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 text-[10px] font-mono text-neutral-400">
            <span className="uppercase tracking-wider">Contents</span>
            <span>{chapters.length} Chapters</span>
          </div>

          <div className="flex-1 my-auto overflow-y-auto py-3 space-y-2">
            <h2 className="text-center font-serif font-bold text-base sm:text-lg text-neutral-900 mb-3 tracking-wide uppercase">
              Table of Contents
            </h2>
            <div className="space-y-1.5 text-xs sm:text-sm">
              {chapters.length === 0 ? (
                <p className="text-center text-neutral-400 font-mono text-xs py-6">
                  No chapters created yet
                </p>
              ) : (
                chapters.map((chap, i) => (
                  <div
                    key={chap.id}
                    onClick={() => onJumpToSpread?.(i + 2)}
                    className="flex items-baseline justify-between group cursor-pointer hover:text-primary transition-colors py-0.5"
                    title={`Jump to Chapter ${i + 1}`}
                  >
                    <span className="font-serif truncate max-w-[75%] group-hover:font-semibold">
                      <span className="font-mono text-[11px] text-neutral-400 mr-2">
                        {String(i + 1).padStart(2, "0")}.
                      </span>
                      {chap.title}
                    </span>
                    <span className="flex-1 border-b border-dotted border-neutral-300 mx-2" />
                    <span className="font-mono text-[11px] text-neutral-400 group-hover:text-primary">
                      {i * 2 + 5}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-end justify-between text-neutral-400 text-[10px] pt-4 border-t border-neutral-200/80 font-mono">
            <span className="text-[9px] text-neutral-400 italic">Click any chapter to jump</span>
            <span>Page {rightPageNum}</span>
          </div>
        </>
      ) : isChapterSpread && chapter ? (
        // SPREAD N RIGHT: Chapter Continuation Page
        <>
          {/* Running Header */}
          <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 text-[10px] font-mono text-neutral-400">
            <span className="uppercase tracking-wider font-mono">Chapter {chapter.position + 1}</span>
            <span className="truncate font-serif italic text-neutral-600 max-w-[70%]">{chapter.title}</span>
          </div>

          {/* Chapter Reading Continuation */}
          <div className="flex-1 my-auto overflow-y-auto py-4 sm:py-6 space-y-4 font-serif text-xs sm:text-sm text-neutral-800 leading-relaxed">
            {writtenParagraphs.length > 3 ? (
              // Continuation paragraphs
              <div className="space-y-3">
                {writtenParagraphs.slice(3, 7).map((p, idx) => (
                  <p key={idx} className="indent-4">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              // Secondary Outline Content & Key Takeaways
              <div className="space-y-4">
                {outlineChapter?.keyPoints && outlineChapter.keyPoints.length > 0 ? (
                  <div className="space-y-2">
                    <p className="font-bold text-neutral-900 font-sans text-xs uppercase tracking-wider">
                      Key Takeaways & Core Concepts:
                    </p>
                    <ul className="space-y-2 list-disc list-inside text-neutral-700 text-xs sm:text-sm">
                      {outlineChapter.keyPoints.map((point: string, pIdx: number) => (
                        <li key={pIdx} className="leading-snug">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-neutral-200/70 bg-black/[0.02] text-xs font-sans text-neutral-600 space-y-2">
                    <p className="font-semibold text-neutral-800">Manuscript Continuation</p>
                    <p className="leading-relaxed font-serif text-neutral-700">
                      The full chapter content will appear here when written in the Editor. You can format headers, bullet lists, block quotes, and rich prose to verify pagination and flow.
                    </p>
                  </div>
                )}

                <div className="pt-6 flex justify-center text-neutral-300">
                  <span className="font-serif text-lg tracking-widest">❦ ❦ ❦</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-end justify-between border-t border-neutral-200/80 pt-2 text-neutral-400 text-[10px] font-mono">
            <span className="font-mono text-neutral-400">{chapter.wordCount} words</span>
            <span>Page {rightPageNum}</span>
          </div>
        </>
      ) : (
        // SPREAD FINAL RIGHT: Colophon & Review Request
        <>
          <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 text-[10px] font-mono text-neutral-400">
            <span className="uppercase tracking-wider">Colophon</span>
            <span className="truncate font-serif italic text-neutral-600">{book.title}</span>
          </div>

          <div className="flex-1 my-auto flex flex-col justify-center text-center px-4 space-y-4 font-serif text-xs sm:text-sm text-neutral-800">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <BookOpen className="h-5 w-5" />
            </div>
            <h2 className="text-base sm:text-lg font-serif font-bold text-neutral-900">
              A Note to the Reader
            </h2>
            <p className="text-neutral-600 leading-relaxed max-w-sm mx-auto text-xs sm:text-sm">
              Thank you for exploring this edition of <span className="font-bold text-neutral-800">&ldquo;{book.title}&rdquo;</span>. If you found value in this work, your review and feedback help fellow readers discover it.
            </p>
            <div className="my-4 h-0.5 w-12 bg-neutral-300 mx-auto" />
            <div className="text-[10px] font-mono text-neutral-400 space-y-1">
              <p className="font-semibold text-neutral-600 font-sans">eBookStudio Publishing Suite</p>
              <p>Physical Book Simulation Engine v2.0</p>
              <p>Amazon KDP & IngramSpark Ready</p>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-neutral-200/80 pt-2 text-neutral-400 text-[10px] font-mono">
            <span>End of Book</span>
            <span>Page {rightPageNum}</span>
          </div>
        </>
      )}
    </div>
  );
}

export const EBookFlipBook = forwardRef<FlipBookHandle, EBookFlipBookProps>(
  ({ book, chapters, currentSpread, onSpreadChange, chapterDetails, paperTone = "cream" }, ref) => {
    // Total spreads:
    // Spread 0: Cover / Half-Title + Title Page
    // Spread 1: Matter / Legal + Table of Contents
    // Spread 2 .. (1 + chapters.length): Chapter spreads
    // Spread (2 + chapters.length): Back Matter & Colophon
    const totalSpreads = Math.max(3, chapters.length + 3);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // 3D Flip animation state
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");
    const [targetSpread, setTargetSpread] = useState(currentSpread);

    // Touch swipe handling
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    const triggerFlip = useCallback(
      (dir: "next" | "prev", toSpread?: number) => {
        if (isFlipping) return;

        let nextIdx = currentSpread;
        if (typeof toSpread === "number") {
          if (toSpread === currentSpread || toSpread < 0 || toSpread >= totalSpreads) return;
          nextIdx = toSpread;
          dir = toSpread > currentSpread ? "next" : "prev";
        } else {
          if (dir === "next") {
            if (currentSpread >= totalSpreads - 1) return;
            nextIdx = currentSpread + 1;
          } else {
            if (currentSpread <= 0) return;
            nextIdx = currentSpread - 1;
          }
        }

        if (soundEnabled) {
          playPaperTurnSound();
        }

        setFlipDirection(dir);
        setTargetSpread(nextIdx);
        setIsFlipping(true);

        // Transition duration matches 800ms
        setTimeout(() => {
          onSpreadChange(nextIdx);
          setIsFlipping(false);
        }, 800);
      },
      [isFlipping, currentSpread, totalSpreads, soundEnabled, onSpreadChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        flipNext: () => triggerFlip("next"),
        flipPrev: () => triggerFlip("prev"),
        flipToSpread: (spreadIdx: number) => triggerFlip("next", spreadIdx),
        getCurrentSpread: () => currentSpread,
      }),
      [triggerFlip, currentSpread],
    );

    // Keyboard navigation: Left/Right arrow keys
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          triggerFlip("next");
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          triggerFlip("prev");
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [triggerFlip]);

    // Touch swipe gestures
    const handleTouchStart = (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          triggerFlip("next");
        } else {
          triggerFlip("prev");
        }
      }
    };

    return (
      <div className="relative mx-auto flex w-full flex-col items-center select-none">
        {/* Sound toggle & status pill */}
        <div className="w-full flex items-center justify-between pb-2 text-[11px] text-neutral-400 px-2">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Interactive 3D Physical Book Spread</span>
          </span>
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={soundEnabled ? "Mute page-turn sound" : "Enable page-turn sound"}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{soundEnabled ? "Sound ON" : "Sound OFF"}</span>
          </button>
        </div>

        {/* Physical Book Outer Casing (Hardcover frame) */}
        <div
          className="relative w-full rounded-[24px] sm:rounded-[36px] border-[10px] sm:border-[16px] border-[#161617] bg-[#161617] p-2.5 sm:p-5 shadow-2xl overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ perspective: "2400px" }}
        >
          {/* Main Book 2-Page Spread Container */}
          <div className="relative w-full aspect-[4/3] min-h-[380px] sm:min-h-[500px] md:min-h-[580px] flex items-stretch">
            {/* 1. LEFT STATIC PAGE */}
            <div
              className="w-1/2 h-full cursor-pointer relative group"
              onClick={() => !isFlipping && triggerFlip("prev")}
              title="Click or drag to flip to previous page (←)"
            >
              <PageSurface
                side="left"
                book={book}
                chapters={chapters}
                spreadIndex={isFlipping && flipDirection === "prev" ? targetSpread : currentSpread}
                totalSpreads={totalSpreads}
                chapterDetails={chapterDetails}
                paperTone={paperTone}
                onJumpToSpread={(s) => triggerFlip("next", s)}
              />

              {/* Hover Page Corner Peel Cue on Left Bottom */}
              {!isFlipping && currentSpread > 0 && (
                <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-10 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute -bottom-5 -left-5 h-10 w-10 bg-white rotate-45 shadow-md border-t border-r border-neutral-300" />
                  <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-neutral-500">←</span>
                </div>
              )}
            </div>

            {/* 2. RIGHT STATIC PAGE */}
            <div
              className="w-1/2 h-full cursor-pointer relative group"
              onClick={() => !isFlipping && triggerFlip("next")}
              title="Click or drag to flip to next page (→)"
            >
              <PageSurface
                side="right"
                book={book}
                chapters={chapters}
                spreadIndex={isFlipping && flipDirection === "next" ? targetSpread : currentSpread}
                totalSpreads={totalSpreads}
                chapterDetails={chapterDetails}
                paperTone={paperTone}
                onJumpToSpread={(s) => triggerFlip("next", s)}
              />

              {/* Shadow cast on incoming right page during flip forward */}
              {isFlipping && flipDirection === "next" && (
                <div
                  className="pointer-events-none absolute inset-0 bg-black/40 z-10 transition-opacity duration-700 ease-out"
                  style={{ opacity: 0 }}
                />
              )}

              {/* Hover Page Corner Peel Cue on Right Bottom */}
              {!isFlipping && currentSpread < totalSpreads - 1 && (
                <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-10 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute -bottom-5 -right-5 h-10 w-10 bg-white rotate-45 shadow-md border-t border-l border-neutral-300" />
                  <span className="absolute bottom-1 right-1.5 text-[9px] font-bold text-neutral-500">→</span>
                </div>
              )}
            </div>

            {/* 3. FLIPPING LEAF (Realistic 3D Perspective Rotation & Shadow) */}
            {isFlipping && (
              <div
                className={cn(
                  "absolute top-0 h-full w-1/2 z-30 pointer-events-none",
                  flipDirection === "next" ? "left-1/2" : "left-0",
                )}
                style={{
                  transformOrigin: flipDirection === "next" ? "left center" : "right center",
                  transformStyle: "preserve-3d",
                  animation:
                    flipDirection === "next"
                      ? "flip-leaf-forward 800ms cubic-bezier(0.25, 1, 0.5, 1) forwards"
                      : "flip-leaf-backward 800ms cubic-bezier(0.25, 1, 0.5, 1) forwards",
                }}
              >
                {/* FRONT FACE OF TURNING LEAF */}
                <div
                  className="absolute inset-0 h-full w-full"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <PageSurface
                    side={flipDirection === "next" ? "right" : "left"}
                    book={book}
                    chapters={chapters}
                    spreadIndex={currentSpread}
                    totalSpreads={totalSpreads}
                    chapterDetails={chapterDetails}
                    paperTone={paperTone}
                    onJumpToSpread={(s) => triggerFlip("next", s)}
                  />
                  {/* Dynamic Shading on Front Face */}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      animation: "flip-shadow-front 800ms ease-in-out forwards",
                    }}
                  />
                </div>

                {/* BACK FACE OF TURNING LEAF (Reveals the target page as it turns over) */}
                <div
                  className="absolute inset-0 h-full w-full"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform:
                      flipDirection === "next" ? "rotateY(180deg)" : "rotateY(-180deg)",
                  }}
                >
                  <PageSurface
                    side={flipDirection === "next" ? "left" : "right"}
                    book={book}
                    chapters={chapters}
                    spreadIndex={targetSpread}
                    totalSpreads={totalSpreads}
                    chapterDetails={chapterDetails}
                    paperTone={paperTone}
                    onJumpToSpread={(s) => triggerFlip("next", s)}
                  />
                  {/* Dynamic Shading on Back Face as it lands */}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      animation: "flip-shadow-back 800ms ease-in-out forwards",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3D Keyframes definition */}
        <style>{`
          @keyframes flip-leaf-forward {
            0% {
              transform: rotateY(0deg);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            50% {
              box-shadow: -20px 20px 40px rgba(0,0,0,0.35);
            }
            100% {
              transform: rotateY(-180deg);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
          }

          @keyframes flip-leaf-backward {
            0% {
              transform: rotateY(0deg);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            50% {
              box-shadow: 20px 20px 40px rgba(0,0,0,0.35);
            }
            100% {
              transform: rotateY(180deg);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
          }

          @keyframes flip-shadow-front {
            0% { background-color: rgba(0, 0, 0, 0); }
            45% { background-color: rgba(0, 0, 0, 0.45); }
            100% { background-color: rgba(0, 0, 0, 0.6); }
          }

          @keyframes flip-shadow-back {
            0% { background-color: rgba(0, 0, 0, 0.6); }
            55% { background-color: rgba(0, 0, 0, 0.45); }
            100% { background-color: rgba(0, 0, 0, 0); }
          }
        `}</style>
      </div>
    );
  },
);

EBookFlipBook.displayName = "EBookFlipBook";
