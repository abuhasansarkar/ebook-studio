"use client";

import React, { memo, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  CaseSensitive,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Sliders,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
  FlipHorizontal,
  FlipVertical,
  Minus,
  Plus,
  Palette,
  Image as ImageIcon,
  Square,
  Circle,
  Copy,
  Trash2,
} from 'lucide-react';
import type {
  CoverDesign,
  DesignLayer,
  TextLayer,
  ShapeLayer,
  ImageLayer,
  CanvasSettings,
} from '@ebook/shared';
import { GOOGLE_COVER_FONTS } from '../types';

interface ContextualToolbarProps {
  design: CoverDesign;
  selectedLayers: DesignLayer[];
  onUpdateLayer: (id: string, patch: Partial<DesignLayer>) => void;
  onUpdateSelectedLayers: (patch: Partial<DesignLayer>) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onToggleStrike: () => void;
  onToggleUppercase: () => void;
  onAlignSelected: (align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetBackground: (color: string) => void;
  onSetShade: (shade: number) => void;
  onSetDimensionsPreset: (preset: CanvasSettings['preset']) => void;
  onOpenAssetPicker: () => void;
}

export const ContextualToolbar = memo(function ContextualToolbar({
  design,
  selectedLayers,
  onUpdateLayer,
  onUpdateSelectedLayers,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleStrike,
  onToggleUppercase,
  onAlignSelected,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
  onSetBackground,
  onSetShade,
  onSetDimensionsPreset,
  onOpenAssetPicker,
}: ContextualToolbarProps) {
  const [showSpacingPopover, setShowSpacingPopover] = useState(false);
  const [showEffectsPopover, setShowEffectsPopover] = useState(false);
  const [showPositionPopover, setShowPositionPopover] = useState(false);

  const isMulti = selectedLayers.length > 1;
  const primary = selectedLayers[0] || null;

  // 1. Multi-Selection Toolbar
  if (isMulti) {
    return (
      <div className="h-11 border-b border-border/80 bg-surface/95 px-4 flex items-center justify-between gap-3 text-xs z-40 select-none shadow-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-primary px-2 py-0.5 rounded bg-primary-soft">
            {selectedLayers.length} elements selected
          </span>
          <div className="h-4 w-px bg-border/80 mx-1" />
          <span className="text-muted-foreground font-medium">Align:</span>
          <button type="button" onClick={() => onAlignSelected('left')} className="p-1 rounded hover:bg-muted" title="Align Left">
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onAlignSelected('center')} className="p-1 rounded hover:bg-muted" title="Align Center">
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onAlignSelected('right')} className="p-1 rounded hover:bg-muted" title="Align Right">
            <AlignRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onDuplicate} className="flex items-center gap-1 px-2.5 py-1 rounded bg-muted/60 hover:bg-muted text-foreground">
            <Copy className="h-3.5 w-3.5" />
            <span>Duplicate All</span>
          </button>
          <button type="button" onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete All</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Single Text Layer Selected Toolbar
  if (primary && primary.type === 'text') {
    const textLayer = primary as TextLayer;
    const isBold = textLayer.weight === '700' || textLayer.weight === '800' || textLayer.weight === '900';

    return (
      <div className="h-11 border-b border-border/80 bg-surface/95 px-4 flex items-center justify-between gap-3 text-xs z-40 select-none shadow-xs overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Font Family Picker */}
          <select
            value={textLayer.font}
            onChange={(e) => onUpdateLayer(textLayer.id, { font: e.target.value })}
            className="h-8 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium max-w-40 focus:outline-hidden focus:ring-1 focus:ring-primary"
          >
            {GOOGLE_COVER_FONTS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Font Size Steppers */}
          <div className="flex items-center rounded-lg border border-border bg-surface h-8 px-1">
            <button
              type="button"
              onClick={() => onUpdateLayer(textLayer.id, { size: Math.max(0.01, textLayer.size - 0.005) })}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-9 text-center font-mono font-bold text-xs select-none">
              {Math.round(textLayer.size * 1000) / 10}
            </span>
            <button
              type="button"
              onClick={() => onUpdateLayer(textLayer.id, { size: Math.min(0.2, textLayer.size + 0.005) })}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Text Color Swatch */}
          <label className="flex items-center gap-1 h-8 px-2 rounded-lg border border-border bg-surface cursor-pointer hover:bg-muted/40" title="Text Color">
            <div className="w-4 h-4 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: textLayer.color }} />
            <input
              type="color"
              value={textLayer.color}
              onChange={(e) => onUpdateLayer(textLayer.id, { color: e.target.value })}
              className="sr-only"
            />
          </label>

          <div className="h-4 w-px bg-border/80 mx-1" />

          {/* Style Toggles: B, I, U, S, aA */}
          <button
            type="button"
            onClick={onToggleBold}
            className={`p-1.5 rounded-lg transition-colors ${isBold ? 'bg-primary-soft text-primary font-bold' : 'hover:bg-muted text-muted-foreground'}`}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleItalic}
            className={`p-1.5 rounded-lg transition-colors ${textLayer.italic ? 'bg-primary-soft text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleUnderline}
            className={`p-1.5 rounded-lg transition-colors ${textLayer.underline ? 'bg-primary-soft text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            title="Underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleStrike}
            className={`p-1.5 rounded-lg transition-colors ${textLayer.strike ? 'bg-primary-soft text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleUppercase}
            className={`p-1.5 rounded-lg transition-colors ${textLayer.uppercase ? 'bg-primary-soft text-primary font-bold' : 'hover:bg-muted text-muted-foreground'}`}
            title="Uppercase"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => {
              const order: TextLayer['align'][] = ['left', 'center', 'right', 'justify'];
              const next = order[(order.indexOf(textLayer.align) + 1) % order.length];
              onUpdateLayer(textLayer.id, { align: next });
            }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title={`Align (${textLayer.align})`}
          >
            {textLayer.align === 'left' ? <AlignLeft className="h-3.5 w-3.5" /> : textLayer.align === 'right' ? <AlignRight className="h-3.5 w-3.5" /> : textLayer.align === 'justify' ? <AlignJustify className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Right Tools: Spacing, Effects, Position */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Spacing Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowSpacingPopover(!showSpacingPopover); setShowEffectsPopover(false); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showSpacingPopover ? 'bg-primary-soft text-primary font-semibold' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Spacing</span>
            </button>
            {showSpacingPopover && (
              <div className="absolute right-0 top-10 w-56 rounded-xl border border-border bg-surface p-3 shadow-xl z-50 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Letter Spacing</span>
                    <span className="font-mono">{textLayer.letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="16"
                    step="0.5"
                    value={textLayer.letterSpacing}
                    onChange={(e) => onUpdateLayer(textLayer.id, { letterSpacing: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Line Height</span>
                    <span className="font-mono">{textLayer.lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.9"
                    max="2.2"
                    step="0.05"
                    value={textLayer.lineHeight}
                    onChange={(e) => onUpdateLayer(textLayer.id, { lineHeight: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Effects Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowEffectsPopover(!showEffectsPopover); setShowSpacingPopover(false); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showEffectsPopover ? 'bg-primary-soft text-primary font-semibold' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Effects</span>
            </button>
            {showEffectsPopover && (
              <div className="absolute right-0 top-10 w-48 rounded-xl border border-border bg-surface p-2 shadow-xl z-50 space-y-1">
                {(['none', 'shadow', 'lift', 'outline', 'pill'] as const).map((eff) => (
                  <button
                    key={eff}
                    type="button"
                    onClick={() => onUpdateLayer(textLayer.id, { effect: eff })}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs capitalize transition-colors ${textLayer.effect === eff ? 'bg-primary text-white font-bold' : 'hover:bg-muted text-foreground'}`}
                  >
                    {eff === 'none' ? 'None' : eff === 'shadow' ? 'Drop Shadow' : eff === 'lift' ? 'Soft Glow (Lift)' : eff === 'outline' ? 'Outline Stroke' : 'Background Pill'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Shape Layer Selected Toolbar
  if (primary && primary.type === 'shape') {
    const shape = primary as ShapeLayer;
    return (
      <div className="h-11 border-b border-border/80 bg-surface/95 px-4 flex items-center justify-between gap-3 text-xs z-40 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground capitalize flex items-center gap-1.5">
            <Square className="h-3.5 w-3.5 text-primary" />
            <span>{shape.shapeType}</span>
          </span>

          <div className="h-4 w-px bg-border/80" />

          {/* Fill Color */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-muted-foreground">Fill:</span>
            <div className="w-5 h-5 rounded border border-black/20" style={{ backgroundColor: shape.fill }} />
            <input
              type="color"
              value={shape.fill}
              onChange={(e) => onUpdateLayer(shape.id, { fill: e.target.value })}
              className="sr-only"
            />
          </label>

          {/* Stroke Color */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-muted-foreground">Border:</span>
            <div className="w-5 h-5 rounded border border-black/20" style={{ backgroundColor: shape.stroke }} />
            <input
              type="color"
              value={shape.stroke === 'transparent' ? '#000000' : shape.stroke}
              onChange={(e) => onUpdateLayer(shape.id, { stroke: e.target.value })}
              className="sr-only"
            />
          </label>

          {/* Border Width */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Width:</span>
            <input
              type="number"
              min="0"
              max="20"
              value={shape.strokeWidth}
              onChange={(e) => onUpdateLayer(shape.id, { strokeWidth: Number(e.target.value) })}
              className="w-12 h-7 rounded border border-border px-1.5 text-center font-mono"
            />
          </div>

          {/* Opacity */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Opacity:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={shape.opacity}
              onChange={(e) => onUpdateLayer(shape.id, { opacity: Number(e.target.value) })}
              className="w-20 accent-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onDuplicate} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 rounded hover:bg-red-500/10 text-red-500" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // 4. Default / Canvas Background Toolbar
  return (
    <div className="h-11 border-b border-border/80 bg-surface/95 px-4 flex items-center justify-between gap-4 text-xs z-40 select-none shadow-xs">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-muted-foreground flex items-center gap-1">
          <Palette className="h-3.5 w-3.5 text-primary" />
          <span>Canvas Background:</span>
        </span>

        {/* Background Color Swatch */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <div className="w-5 h-5 rounded-md border border-black/20 shadow-xs" style={{ backgroundColor: design.background }} />
          <span className="font-mono text-xs">{design.background}</span>
          <input
            type="color"
            value={design.background}
            onChange={(e) => onSetBackground(e.target.value)}
            className="sr-only"
          />
        </label>

        <div className="h-4 w-px bg-border/80" />

        {/* Dark Overlay Slider */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Dark Overlay:</span>
          <input
            type="range"
            min="0"
            max="0.85"
            step="0.05"
            value={design.shade}
            onChange={(e) => onSetShade(Number(e.target.value))}
            className="w-24 accent-primary"
          />
          <span className="font-mono text-xs text-muted-foreground">{Math.round(design.shade * 100)}%</span>
        </div>
      </div>

      {/* Preset Dimension Selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Dimension:</span>
        <select
          value={design.canvas?.preset || 'kindle'}
          onChange={(e) => onSetDimensionsPreset(e.target.value as any)}
          className="h-7 rounded-md border border-border bg-surface px-2 text-xs font-medium focus:outline-hidden"
        >
          <option value="kindle">Kindle / eBook (1600 × 2560)</option>
          <option value="paperback_6x9">Paperback 6" × 9" (1800 × 2700)</option>
          <option value="square">Square / Audio (2400 × 2400)</option>
        </select>
      </div>
    </div>
  );
});
