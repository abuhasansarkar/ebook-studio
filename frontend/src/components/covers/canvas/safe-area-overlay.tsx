"use client";

import React, { memo } from 'react';

interface SafeAreaOverlayProps {
  width: number;
  height: number;
  showSafeMargin: boolean;
  showGrid: boolean;
}

export const SafeAreaOverlay = memo(function SafeAreaOverlay({
  width,
  height,
  showSafeMargin,
  showGrid,
}: SafeAreaOverlayProps) {
  if (!showSafeMargin && !showGrid) return null;

  // 8% safe margin for Kindle & paperback trim
  const marginX = width * 0.08;
  const marginY = height * 0.08;
  const safeW = width - marginX * 2;
  const safeH = height - marginY * 2;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20">
      {/* 3x3 Rule of Thirds Grid */}
      {showGrid && (
        <svg className="w-full h-full absolute inset-0 opacity-20">
          <line x1={width / 3} y1={0} x2={width / 3} y2={height} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" />
          <line x1={(width * 2) / 3} y1={0} x2={(width * 2) / 3} y2={height} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" />
          <line x1={0} y1={height / 3} x2={width} y2={height / 3} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" />
          <line x1={0} y1={(height * 2) / 3} x2={width} y2={(height * 2) / 3} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" />
        </svg>
      )}

      {/* Safe Margins Box */}
      {showSafeMargin && (
        <div
          className="absolute border border-dashed border-emerald-400/40 rounded-xs"
          style={{
            left: marginX,
            top: marginY,
            width: safeW,
            height: safeH,
          }}
        >
          <span className="absolute top-1 left-2 text-[10px] font-mono uppercase tracking-wider text-emerald-400/60 bg-black/40 px-1 rounded">
            Kindle Safe Zone
          </span>
        </div>
      )}
    </div>
  );
});
