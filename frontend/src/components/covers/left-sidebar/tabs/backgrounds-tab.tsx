"use client";

import React from 'react';
import { Palette, Trash2, SunMoon } from 'lucide-react';

interface BackgroundsTabProps {
  backgroundColor: string;
  shade: number;
  hasArtwork: boolean;
  onSetBackground: (color: string) => void;
  onSetShade: (shade: number) => void;
  onRemoveArtwork: () => void;
}

const PALETTES = [
  { name: 'Dark Navy', color: '#091528' },
  { name: 'Midnight Violet', color: '#1a0e2a' },
  { name: 'Charcoal Noir', color: '#111827' },
  { name: 'Deep Crimson', color: '#2b0c16' },
  { name: 'Emerald Forest', color: '#062016' },
  { name: 'Warm Amber', color: '#2d1808' },
  { name: 'Pure White', color: '#ffffff' },
  { name: 'Neutral Slate', color: '#1e293b' },
];

export function BackgroundsTab({
  backgroundColor,
  shade,
  hasArtwork,
  onSetBackground,
  onSetShade,
  onRemoveArtwork,
}: BackgroundsTabProps) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Canvas Background</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Customize the backdrop color and dark overlay intensity.
        </p>
      </div>

      {/* Palette Swatches */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Curated Colors
        </span>
        <div className="grid grid-cols-4 gap-2.5">
          {PALETTES.map((p) => (
            <button
              key={p.color}
              type="button"
              onClick={() => onSetBackground(p.color)}
              className="flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div
                className={`w-11 h-11 rounded-xl border-2 transition-all shadow-xs group-hover:scale-105 ${
                  backgroundColor.toLowerCase() === p.color.toLowerCase()
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border/60 hover:border-border'
                }`}
                style={{ backgroundColor: p.color }}
              />
              <span className="text-[10px] text-muted-foreground group-hover:text-foreground truncate max-w-full">
                {p.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Color Input */}
      <div className="space-y-1.5 pt-1">
        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>Custom Hex Color</span>
          <span className="font-mono text-muted-foreground">{backgroundColor}</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={backgroundColor}
            onChange={(e) => onSetBackground(e.target.value)}
            className="w-10 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-surface"
          />
          <input
            type="text"
            value={backgroundColor}
            onChange={(e) => onSetBackground(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-border bg-surface px-3 text-xs font-mono uppercase"
          />
        </div>
      </div>

      {/* Dark Overlay Slider */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <SunMoon className="h-3.5 w-3.5 text-primary" />
            <span>Dark Overlay Intensity</span>
          </span>
          <span className="font-mono text-primary">{Math.round(shade * 100)}%</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enhances contrast so overlaid title and author text remain crystal clear over photographic artwork.
        </p>
        <input
          type="range"
          min="0"
          max="0.85"
          step="0.05"
          value={shade}
          onChange={(e) => onSetShade(Number(e.target.value))}
          className="w-full accent-primary cursor-pointer"
        />
      </div>

      {/* Artwork management */}
      {hasArtwork && (
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={onRemoveArtwork}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove Background Artwork</span>
          </button>
        </div>
      )}
    </div>
  );
}
