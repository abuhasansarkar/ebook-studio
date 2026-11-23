"use client";

import React, { memo } from 'react';
import type { AlignmentGuide } from '../types';

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
  canvasWidth: number;
  canvasHeight: number;
}

export const AlignmentGuides = memo(function AlignmentGuides({
  guides,
  canvasWidth,
  canvasHeight,
}: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      {guides.map((guide, index) => {
        if (guide.type === 'vertical') {
          const left = guide.position * canvasWidth;
          return (
            <div
              key={`guide-v-${index}`}
              className="absolute top-0 bottom-0 border-l border-magenta-500 shadow-sm"
              style={{
                left: `${left}px`,
                borderLeftColor: '#d946ef',
                borderLeftWidth: '1.5px',
              }}
            >
              {guide.label && (
                <span className="absolute top-2 left-1 text-[9px] font-mono text-white bg-fuchsia-600 px-1 py-0.5 rounded shadow">
                  {guide.label}
                </span>
              )}
            </div>
          );
        }

        const top = guide.position * canvasHeight;
        return (
          <div
            key={`guide-h-${index}`}
            className="absolute left-0 right-0 border-t border-magenta-500 shadow-sm"
            style={{
              top: `${top}px`,
              borderTopColor: '#d946ef',
              borderTopWidth: '1.5px',
            }}
          >
            {guide.label && (
              <span className="absolute left-2 -top-4 text-[9px] font-mono text-white bg-fuchsia-600 px-1 py-0.5 rounded shadow">
                {guide.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
