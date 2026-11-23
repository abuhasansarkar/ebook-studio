"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlipBookHandle {
  flipNext: () => void;
  flipPrev: () => void;
  flipToSpread: (spreadIndex: number) => void;
  getCurrentSpread: () => number;
}

interface CompletedPageItem {
  id: string;
  pageNumber: number;
  title: string;
  caption?: string | null;
  asset?: {
    id: string;
  } | null;
}

interface ColoringFlipBookProps {
  book: {
    title: string;
    subtitle?: string | null;
  };
  completedPages: CompletedPageItem[];
  currentSpread: number;
  onSpreadChange: (spread: number) => void;
}

// Realistic zero-dependency synthetic paper rustle sound
function playPaperTurnSound() {
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
 * Render individual page content (Left or Right) matching the physical paperback layout
 */
function PageSurface({
  side,
  book,
  spreadIndex,
  completedPages,
}: {
  side: "left" | "right";
  book: { title: string; subtitle?: string | null };
  spreadIndex: number;
  completedPages: CompletedPageItem[];
}) {
  const isTitleSpread = spreadIndex === 0;
  const currentIllustration = spreadIndex > 0 ? completedPages[spreadIndex - 1] : null;
  const leftPageNum = (spreadIndex - 1) * 2 + 3;
  const rightPageNum = (spreadIndex - 1) * 2 + 4;

  if (side === "left") {
    return (
      <div className="relative h-full w-full bg-[#fcfbf9] text-neutral-800 flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden rounded-l-2xl border-y border-l border-neutral-300/80 border-r-[6px] border-[#161617] shadow-xs">
        {/* Spine Depth Shadow on Right edge */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 bg-gradient-to-l from-black/25 via-black/5 to-transparent z-10" />

        {isTitleSpread ? (
          // SPREAD 0 LEFT: Title Page
          <>
            <div />
            <div className="text-center px-4">
              <h1 className="text-2xl sm:text-4xl font-black text-black tracking-tight leading-tight">
                {book?.title || "Coloring Book"}
              </h1>
              {book?.subtitle && (
                <p className="mt-3 text-xs sm:text-sm text-neutral-600 leading-relaxed font-medium">
                  {book.subtitle}
                </p>
              )}
            </div>
            <div className="flex items-end justify-between text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
              <span className="font-mono text-neutral-400">Page 1</span>
              <div className="text-center font-sans leading-tight">
                <p className="font-semibold text-neutral-600">Published with eBookStudio</p>
                <p className="text-[10px]">© All rights reserved</p>
              </div>
              <span className="opacity-0 font-mono">Page 1</span>
            </div>
          </>
        ) : (
          // SPREAD N LEFT: Blank reverse to prevent marker bleed-through
          <>
            <div />
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-xs sm:text-sm font-mono tracking-widest uppercase text-neutral-300 select-none">
                [ Blank Page • Prevents Bleed-Through ]
              </span>
            </div>
            <div className="flex items-end justify-between text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
              <span className="font-mono text-neutral-400">Page {leftPageNum}</span>
              <span className="text-[10px] font-mono text-neutral-400/80 uppercase tracking-wider">
                Single-Sided Print
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  // RIGHT SIDE
  return (
    <div className="relative h-full w-full bg-[#fcfbf9] text-neutral-800 flex flex-col justify-between p-4 sm:p-6 select-none overflow-hidden rounded-r-2xl border-y border-r border-neutral-300/80 border-l-[6px] border-[#161617] shadow-xs">
      {/* Spine Depth Shadow on Left edge */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-16 bg-gradient-to-r from-black/25 via-black/5 to-transparent z-10" />

      {isTitleSpread ? (
        // SPREAD 0 RIGHT: Intentionally Blank reverse of title page
        <>
          <div />
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-xs sm:text-sm font-mono tracking-widest text-neutral-300 select-none">
              [ Intentionally Blank ]
            </span>
          </div>
          <div className="flex items-end justify-end text-neutral-400 text-[11px] pt-4 border-t border-neutral-200/80">
            <span className="font-mono text-neutral-400">Page 2</span>
          </div>
        </>
      ) : currentIllustration && currentIllustration.asset ? (
        // SPREAD N RIGHT: Coloring Illustration Page
        <>
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-neutral-200/80 px-2 pb-2 text-[10px] font-mono text-neutral-400">
            <span className="truncate font-semibold text-neutral-600 max-w-[65%]">{book?.title}</span>
            <span>Plate #{spreadIndex}</span>
          </div>

          {/* Centered High-Res Artwork */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden my-auto p-2 sm:p-4">
            <img
              src={`/api/v1/assets/${currentIllustration.asset.id}/view`}
              alt={currentIllustration.title}
              className="max-h-[460px] w-auto max-w-full object-contain filter drop-shadow-md rounded-lg transition-transform duration-200"
              loading="eager"
            />
          </div>

          {/* Footer Bar */}
          <div className="flex items-end justify-between border-t border-neutral-200/80 px-2 pt-2 text-neutral-400 text-[11px]">
            <span className="font-semibold text-neutral-700 truncate max-w-[70%]">
              {currentIllustration.caption || currentIllustration.title}
            </span>
            <span className="font-mono text-neutral-400">Page {rightPageNum}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-neutral-400 text-xs font-mono">
          Page illustration not generated yet
        </div>
      )}
    </div>
  );
}

export const ColoringFlipBook = forwardRef<FlipBookHandle, ColoringFlipBookProps>(
  ({ book, completedPages, currentSpread, onSpreadChange }, ref) => {
    const totalSpreads = completedPages.length + 1;
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
        {/* Sound toggle pill */}
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
                spreadIndex={isFlipping && flipDirection === "prev" ? targetSpread : currentSpread}
                completedPages={completedPages}
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
                spreadIndex={isFlipping && flipDirection === "next" ? targetSpread : currentSpread}
                completedPages={completedPages}
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
                    spreadIndex={currentSpread}
                    completedPages={completedPages}
                  />
                  {/* Dynamic Shading on Front Face */}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      animation: "flip-shadow-front 800ms ease-in-out forwards",
                    }}
                  />
                </div>

                {/* BACK FACE OF TURNING LEAF (Reveals the next page as it turns over) */}
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
                    spreadIndex={targetSpread}
                    completedPages={completedPages}
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

ColoringFlipBook.displayName = "ColoringFlipBook";
