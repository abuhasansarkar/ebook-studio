"use client";

import React, { memo } from 'react';

interface CanvasRulerProps {
  width: number;
  height: number;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  cursorPos?: { x: number; y: number } | null;
}

export const CanvasRuler = memo(function CanvasRuler({
  width,
  height,
  scale,
  cursorPos,
}: CanvasRulerProps) {
  // Render horizontal tick marks every 100px native
  const hTicks = [];
  const step = 100;
  for (let x = 0; x <= width; x += step) {
    const isMajor = x % 500 === 0;
    hTicks.push(
      <g key={`h-${x}`} transform={`translate(${x * scale}, 0)`}>
        <line x1={0} y1={isMajor ? 0 : 12} x2={0} y2={20} stroke="currentColor" strokeWidth={1} className="opacity-30" />
        {isMajor && (
          <text x={3} y={10} fontSize={9} fill="currentColor" className="opacity-60 select-none font-mono">
            {x}
          </text>
        )}
      </g>
    );
  }

  // Render vertical tick marks every 100px native
  const vTicks = [];
  for (let y = 0; y <= height; y += step) {
    const isMajor = y % 500 === 0;
    vTicks.push(
      <g key={`v-${y}`} transform={`translate(0, ${y * scale})`}>
        <line x1={isMajor ? 0 : 12} y1={0} x2={20} y2={0} stroke="currentColor" strokeWidth={1} className="opacity-30" />
        {isMajor && (
          <text x={2} y={12} fontSize={9} fill="currentColor" className="opacity-60 select-none font-mono" transform="rotate(-90 8 12)">
            {y}
          </text>
        )}
      </g>
    );
  }

  return (
    <>
      {/* Top Ruler */}
      <div className="absolute top-0 left-6 right-0 h-6 bg-surface/80 backdrop-blur-xs border-b border-border/40 z-30 overflow-hidden pointer-events-none select-none">
        <svg className="w-full h-full text-muted-foreground overflow-visible">
          {hTicks}
          {cursorPos && (
            <line
              x1={cursorPos.x}
              y1={0}
              x2={cursorPos.x}
              y2={24}
              stroke="#8b5cf6"
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>

      {/* Left Ruler */}
      <div className="absolute top-6 left-0 bottom-0 w-6 bg-surface/80 backdrop-blur-xs border-r border-border/40 z-30 overflow-hidden pointer-events-none select-none">
        <svg className="w-full h-full text-muted-foreground overflow-visible">
          {vTicks}
          {cursorPos && (
            <line
              x1={0}
              y1={cursorPos.y}
              x2={24}
              y2={cursorPos.y}
              stroke="#8b5cf6"
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>

      {/* Top-Left Corner Box */}
      <div className="absolute top-0 left-0 w-6 h-6 bg-surface border-r border-b border-border/50 z-40 flex items-center justify-center">
        <span className="text-[9px] font-mono text-muted-foreground opacity-60">px</span>
      </div>
    </>
  );
});
