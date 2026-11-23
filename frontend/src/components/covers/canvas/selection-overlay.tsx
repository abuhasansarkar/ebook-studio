"use client";

import React, { memo } from 'react';
import {
  Copy,
  Trash2,
  Lock,
  Unlock,
  RotateCw,
  BringToFront,
  SendToBack,
  Layers,
  MoreHorizontal,
} from 'lucide-react';
import type { DesignLayer } from '@ebook/shared';
import type { ResizeHandle } from '../types';

interface SelectionOverlayProps {
  selectedLayers: DesignLayer[];
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  onStartResize: (e: React.PointerEvent, handle: ResizeHandle) => void;
  onStartRotate: (e: React.PointerEvent) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}

export const SelectionOverlay = memo(function SelectionOverlay({
  selectedLayers,
  canvasWidth,
  canvasHeight,
  scale,
  onStartResize,
  onStartRotate,
  onDuplicate,
  onDelete,
  onToggleLock,
  onBringToFront,
  onSendToBack,
}: SelectionOverlayProps) {
  if (selectedLayers.length === 0) return null;

  // Compute common bounding box in normalized 0..1 coordinates
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let isAnyLocked = false;

  selectedLayers.forEach((l) => {
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x + l.width);
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y + l.height);
    if (l.locked) isAnyLocked = true;
  });

  const isMulti = selectedLayers.length > 1;
  const rotation = !isMulti ? selectedLayers[0].rotation : 0;

  // Screen coordinates inside the scaled canvas container
  const boxLeft = minX * canvasWidth;
  const boxTop = minY * canvasHeight;
  const boxWidth = (maxX - minX) * canvasWidth;
  const boxHeight = (maxY - minY) * canvasHeight;

  return (
    <div
      className="absolute pointer-events-none z-30 select-none"
      style={{
        left: `${boxLeft}px`,
        top: `${boxTop}px`,
        width: `${boxWidth}px`,
        height: `${boxHeight}px`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {/* Selection Border */}
      <div
        className={`w-full h-full border-2 ${
          isAnyLocked
            ? 'border-amber-500/80'
            : isMulti
              ? 'border-indigo-500 shadow-xs'
              : 'border-purple-500 shadow-xs'
        }`}
      />

      {/* Canva Floating Action Toolbar attached above selection */}
      <div
        className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-surface/95 border border-border/80 px-2 py-1 shadow-lg backdrop-blur-md pointer-events-auto transition-transform hover:scale-105 z-50 text-foreground"
      >
        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate element (Ctrl+D)"
          className="p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleLock}
          title={isAnyLocked ? 'Unlock element' : 'Lock element'}
          className="p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {isAnyLocked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>

        {onBringToFront && (
          <button
            type="button"
            onClick={onBringToFront}
            title="Bring to Front"
            className="p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <BringToFront className="h-3.5 w-3.5" />
          </button>
        )}

        {onSendToBack && (
          <button
            type="button"
            onClick={onSendToBack}
            title="Send to Back"
            className="p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <SendToBack className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="h-3.5 w-px bg-border/60 mx-0.5" />

        <button
          type="button"
          onClick={onDelete}
          title="Delete element (Delete)"
          className="p-1.5 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!isAnyLocked && (
        <>
          {/* 4 Corner Resize Handles */}
          <div
            onPointerDown={(e) => onStartResize(e, 'nw')}
            className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 'ne')}
            className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 'sw')}
            className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 'se')}
            className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
          />

          {/* 4 Edge Resize Pill Handles */}
          <div
            onPointerDown={(e) => onStartResize(e, 'n')}
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-purple-600 rounded-full shadow-sm cursor-ns-resize pointer-events-auto hover:scale-110 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 's')}
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-purple-600 rounded-full shadow-sm cursor-ns-resize pointer-events-auto hover:scale-110 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 'w')}
            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-6 bg-white border border-purple-600 rounded-full shadow-sm cursor-ew-resize pointer-events-auto hover:scale-110 transition-transform"
          />
          <div
            onPointerDown={(e) => onStartResize(e, 'e')}
            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-6 bg-white border border-purple-600 rounded-full shadow-sm cursor-ew-resize pointer-events-auto hover:scale-110 transition-transform"
          />

          {/* Rotation Handle attached below */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
            <div className="w-0.5 h-3 bg-purple-500" />
            <button
              type="button"
              onPointerDown={onStartRotate}
              title="Drag to rotate element (Hold Shift for 15° snap)"
              className="w-7 h-7 rounded-full bg-white border-2 border-purple-600 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform text-purple-600"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
});
