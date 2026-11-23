"use client";

import React from 'react';
import {
  Sliders,
  Type,
  Square,
  ShieldAlert,
  Sparkles,
  RotateCw,
} from 'lucide-react';
import type { DesignLayer, TextLayer, ShapeLayer, ImageLayer } from '@ebook/shared';

interface PropertiesPanelProps {
  layer: DesignLayer | null;
  backgroundColor: string;
  shade: number;
  onUpdateLayer: (id: string, patch: Partial<DesignLayer>) => void;
}

function calculateContrast(textHex: string, bgHex: string, shade: number) {
  const getLum = (hex: string, mult: number) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0.5;
    const rgb = [1, 3, 5]
      .map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) * mult)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = getLum(textHex, 1);
  const b = getLum(bgHex, 1 - shade);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function PropertiesPanel({
  layer,
  backgroundColor,
  shade,
  onUpdateLayer,
}: PropertiesPanelProps) {
  if (!layer) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">No Element Selected</p>
        <p>Click on any text, shape, or image on the canvas to inspect its properties.</p>
      </div>
    );
  }

  const contrast =
    layer.type === 'text'
      ? calculateContrast((layer as TextLayer).color, backgroundColor, shade)
      : null;

  return (
    <div className="space-y-4 p-4 text-xs">
      <div>
        <h4 className="font-bold text-foreground capitalize flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-primary" />
          <span>{layer.name} Properties</span>
        </h4>
        <span className="text-[10px] text-muted-foreground uppercase font-mono">
          Type: {layer.type}
        </span>
      </div>

      {/* Text-Specific Properties */}
      {layer.type === 'text' && (
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Text Content</label>
            <textarea
              value={(layer as TextLayer).text}
              onChange={(e) => onUpdateLayer(layer.id, { text: e.target.value })}
              rows={3}
              className="w-full p-2 rounded-lg border border-border bg-surface text-xs focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Metadata Role</label>
            <select
              value={(layer as TextLayer).role || 'custom'}
              onChange={(e) => onUpdateLayer(layer.id, { role: e.target.value as any })}
              className="w-full h-8 rounded-lg border border-border bg-surface px-2 text-xs focus:outline-hidden"
            >
              <option value="title">Book Title</option>
              <option value="subtitle">Subtitle</option>
              <option value="author">Author Name</option>
              <option value="custom">General / Custom Text</option>
            </select>
          </div>

          {/* Contrast checker readout */}
          {contrast !== null && (
            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between text-[11px] ${
                contrast >= 4.5
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {contrast < 4.5 && <ShieldAlert className="h-3.5 w-3.5" />}
                <span className="font-semibold">Contrast: {contrast.toFixed(1)}:1</span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider">
                {contrast >= 7 ? 'AAA Pass' : contrast >= 4.5 ? 'AA Pass' : 'Low Contrast'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Geometry / Numeric Coordinates */}
      <div className="space-y-2 pt-2 border-t border-border">
        <span className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
          Coordinates & Transform
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">X (%)</label>
            <input
              type="number"
              step="0.1"
              value={Math.round(layer.x * 1000) / 10}
              onChange={(e) => onUpdateLayer(layer.id, { x: Number(e.target.value) / 100 })}
              className="w-full h-7 rounded border border-border bg-surface px-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">Y (%)</label>
            <input
              type="number"
              step="0.1"
              value={Math.round(layer.y * 1000) / 10}
              onChange={(e) => onUpdateLayer(layer.id, { y: Number(e.target.value) / 100 })}
              className="w-full h-7 rounded border border-border bg-surface px-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">Width (%)</label>
            <input
              type="number"
              step="0.1"
              value={Math.round(layer.width * 1000) / 10}
              onChange={(e) => onUpdateLayer(layer.id, { width: Number(e.target.value) / 100 })}
              className="w-full h-7 rounded border border-border bg-surface px-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">Height (%)</label>
            <input
              type="number"
              step="0.1"
              value={Math.round(layer.height * 1000) / 10}
              onChange={(e) => onUpdateLayer(layer.id, { height: Number(e.target.value) / 100 })}
              className="w-full h-7 rounded border border-border bg-surface px-2 font-mono text-xs"
            />
          </div>
        </div>

        {/* Rotation Stepper */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <RotateCw className="h-3 w-3" />
              <span>Rotation</span>
            </span>
            <span className="font-mono">{layer.rotation}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            value={layer.rotation}
            onChange={(e) => onUpdateLayer(layer.id, { rotation: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        {/* Opacity Slider */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Opacity</span>
            <span className="font-mono">{Math.round(layer.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={layer.opacity}
            onChange={(e) => onUpdateLayer(layer.id, { opacity: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
