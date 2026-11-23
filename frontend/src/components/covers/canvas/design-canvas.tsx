"use client";

import React, { useRef, useState, useCallback, useEffect, memo } from 'react';
import type {
  CoverDesign,
  DesignLayer,
  TextLayer,
  ShapeLayer,
  IconLayer,
  ImageLayer,
} from '@ebook/shared';
import { imageUrl } from '@/components/assets/asset-library';
import { CanvasRuler } from './canvas-ruler';
import { SafeAreaOverlay } from './safe-area-overlay';
import { AlignmentGuides } from './alignment-guides';
import { SelectionOverlay } from './selection-overlay';
import type { ResizeHandle, AlignmentGuide } from '../types';

interface DesignCanvasProps {
  design: CoverDesign;
  selectedLayerIds: string[];
  zoom: number;
  showRulers: boolean;
  showGuides: boolean;
  showSafeMargin: boolean;
  snapToGrid: boolean;
  onSelectLayer: (id: string, isMulti?: boolean) => void;
  onDeselectAll: () => void;
  onSelectAll: () => void;
  onUpdateLayer: (id: string, patch: Partial<DesignLayer>, recordHistory?: boolean) => void;
  onRemoveLayers: (ids: string[]) => void;
  onDuplicateLayers: (ids: string[]) => void;
  onToggleLock: (id: string) => void;
  onBringForward?: (id: string) => void;
  onSendBackward?: (id: string) => void;
  onBringToFront?: (id: string) => void;
  onSendToBack?: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const DesignCanvas = memo(function DesignCanvas({
  design,
  selectedLayerIds,
  zoom,
  showRulers,
  showGuides,
  showSafeMargin,
  snapToGrid,
  onSelectLayer,
  onDeselectAll,
  onSelectAll,
  onUpdateLayer,
  onRemoveLayers,
  onDuplicateLayers,
  onToggleLock,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onUndo,
  onRedo,
}: DesignCanvasProps) {
  const canvasWidth = design.canvas?.width || 1600;
  const canvasHeight = design.canvas?.height || 2560;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // Drag session
  const dragRef = useRef<{
    startX: number;
    startY: number;
    layers: Record<string, { x: number; y: number; width: number; height: number }>;
  } | null>(null);

  // Resize session
  const resizeRef = useRef<{
    handle: ResizeHandle;
    startX: number;
    startY: number;
    layer: DesignLayer;
  } | null>(null);

  // Rotate session
  const rotateRef = useRef<{
    startX: number;
    startY: number;
    center: { x: number; y: number };
    startAngle: number;
    layer: DesignLayer;
  } | null>(null);

  const selectedLayers = (design.layers || []).filter((l) => selectedLayerIds.includes(l.id));

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerIds.length > 0) {
        e.preventDefault();
        onRemoveLayers(selectedLayerIds);
      } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onDuplicateLayers(selectedLayerIds);
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSelectAll();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeselectAll();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        onRedo();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && selectedLayers.length > 0) {
        e.preventDefault();
        const delta = (e.shiftKey ? 10 : 1) / canvasWidth;
        const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
        const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
        selectedLayers.forEach((l) => {
          if (!l.locked) {
            onUpdateLayer(l.id, {
              x: Math.max(0, Math.min(1 - l.width, l.x + dx)),
              y: Math.max(0, Math.min(1 - l.height, l.y + dy)),
            });
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerIds, selectedLayers, canvasWidth, onRemoveLayers, onDuplicateLayers, onSelectAll, onDeselectAll, onUndo, onRedo, onUpdateLayer]);

  // Pointer drag to move elements
  const handleLayerPointerDown = useCallback((e: React.PointerEvent, layer: DesignLayer) => {
    e.stopPropagation();
    if (layer.locked) {
      onSelectLayer(layer.id, e.shiftKey);
      return;
    }

    if (!selectedLayerIds.includes(layer.id)) {
      onSelectLayer(layer.id, e.shiftKey);
    }

    const startLayers: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const layersToMove = selectedLayerIds.includes(layer.id) ? selectedLayers : [layer];
    layersToMove.forEach((l) => {
      startLayers[l.id] = { x: l.x, y: l.y, width: l.width, height: l.height };
    });

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      layers: startLayers,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [selectedLayerIds, selectedLayers, onSelectLayer]);

  // Start resize
  const handleStartResize = useCallback((e: React.PointerEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    if (selectedLayers.length === 0) return;
    const primary = selectedLayers[0];
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      layer: { ...primary },
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [selectedLayers]);

  // Start rotate
  const handleStartRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedLayers.length === 0) return;
    const primary = selectedLayers[0];
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const centerX = rect.left + (primary.x + primary.width / 2) * canvasWidth * zoom;
    const centerY = rect.top + (primary.y + primary.height / 2) * canvasHeight * zoom;

    const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const startAngle = (rad * 180) / Math.PI;

    rotateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      center: { x: centerX, y: centerY },
      startAngle,
      layer: { ...primary },
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [selectedLayers, canvasWidth, canvasHeight, zoom]);

  // Pointer move (handles drag, resize, rotate, and snapping)
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Update ruler tracking
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setCursorPos({
        x: Math.max(0, e.clientX - rect.left),
        y: Math.max(0, e.clientY - rect.top),
      });
    }

    // 1. Drag move
    if (dragRef.current) {
      const { startX, startY, layers } = dragRef.current;
      const dx = (e.clientX - startX) / (canvasWidth * zoom);
      const dy = (e.clientY - startY) / (canvasHeight * zoom);

      const guides: AlignmentGuide[] = [];

      Object.entries(layers).forEach(([id, startPos]) => {
        let nextX = startPos.x + dx;
        let nextY = startPos.y + dy;

        // Snapping logic if enabled
        if (snapToGrid) {
          const snapThreshold = 12 / (canvasWidth * zoom);
          // Canvas horizontal center (0.5)
          const centerX = nextX + startPos.width / 2;
          if (Math.abs(centerX - 0.5) < snapThreshold) {
            nextX = 0.5 - startPos.width / 2;
            guides.push({ type: 'vertical', position: 0.5, label: 'Center' });
          }
          // Canvas vertical center (0.5)
          const centerY = nextY + startPos.height / 2;
          if (Math.abs(centerY - 0.5) < snapThreshold) {
            nextY = 0.5 - startPos.height / 2;
            guides.push({ type: 'horizontal', position: 0.5, label: 'Middle' });
          }
        }

        onUpdateLayer(id, {
          x: Math.max(0, Math.min(1 - startPos.width, nextX)),
          y: Math.max(0, Math.min(1 - startPos.height, nextY)),
        }, false);
      });

      setAlignmentGuides(guides);
      return;
    }

    // 2. Resize move
    if (resizeRef.current) {
      const { handle, startX, startY, layer } = resizeRef.current;
      const dx = (e.clientX - startX) / (canvasWidth * zoom);
      const dy = (e.clientY - startY) / (canvasHeight * zoom);

      let { x, y, width, height } = layer;

      if (handle.includes('e')) width = Math.max(0.04, layer.width + dx);
      if (handle.includes('s')) height = Math.max(0.02, layer.height + dy);
      if (handle.includes('w')) {
        const newWidth = Math.max(0.04, layer.width - dx);
        x = layer.x + (layer.width - newWidth);
        width = newWidth;
      }
      if (handle.includes('n')) {
        const newHeight = Math.max(0.02, layer.height - dy);
        y = layer.y + (layer.height - newHeight);
        height = newHeight;
      }

      onUpdateLayer(layer.id, { x, y, width, height }, false);
      return;
    }

    // 3. Rotate move
    if (rotateRef.current) {
      const { center, layer } = rotateRef.current;
      const rad = Math.atan2(e.clientY - center.y, e.clientX - center.x);
      let deg = Math.round((rad * 180) / Math.PI + 90);
      if (deg < 0) deg += 360;

      // Hold Shift for 15-degree increments
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }

      onUpdateLayer(layer.id, { rotation: deg }, false);
    }
  }, [canvasWidth, canvasHeight, zoom, snapToGrid, onUpdateLayer]);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current || resizeRef.current || rotateRef.current) {
      dragRef.current = null;
      resizeRef.current = null;
      rotateRef.current = null;
      setAlignmentGuides([]);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full bg-neutral-950 overflow-auto flex items-center justify-center p-12 select-none"
      onPointerDown={onDeselectAll}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { handlePointerUp(); setCursorPos(null); }}
    >
      {/* Rulers */}
      {showRulers && (
        <CanvasRuler
          width={canvasWidth}
          height={canvasHeight}
          scale={zoom}
          scrollLeft={0}
          scrollTop={0}
          cursorPos={cursorPos}
        />
      )}

      {/* Center Canvas Shadowed Card */}
      <div
        ref={canvasRef}
        className="relative shadow-2xl transition-shadow border border-border/50 overflow-hidden"
        style={{
          width: `${canvasWidth * zoom}px`,
          height: `${canvasHeight * zoom}px`,
          backgroundColor: design.background,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Scaled Native Coordinate System */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* Background Artwork Image */}
          {design.artworkId && (
            <img
              src={imageUrl(design.artworkId)}
              alt="Cover Artwork"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            />
          )}

          {/* Dark Overlay Shade */}
          <div
            className="absolute inset-0 pointer-events-none transition-colors"
            style={{ backgroundColor: `rgba(0,0,0,${design.shade})` }}
          />

          {/* Safe Margins & 3x3 Grid */}
          <SafeAreaOverlay
            width={canvasWidth}
            height={canvasHeight}
            showSafeMargin={showSafeMargin}
            showGrid={showGuides}
          />

          {/* Magnetic Alignment Snap Guidelines */}
          <AlignmentGuides
            guides={alignmentGuides}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />

          {/* Canvas Layers Stack */}
          {(design.layers || []).map((layer) => {
            if (layer.hidden) return null;

            const isSelected = selectedLayerIds.includes(layer.id);
            const left = layer.x * canvasWidth;
            const top = layer.y * canvasHeight;
            const width = layer.width * canvasWidth;
            const height = layer.height * canvasHeight;

            return (
              <div
                key={layer.id}
                onPointerDown={(e) => handleLayerPointerDown(e, layer)}
                className={`absolute transition-opacity ${layer.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  transform: `rotate(${layer.rotation}deg)`,
                  transformOrigin: 'center center',
                  opacity: layer.opacity,
                  zIndex: layer.zIndex,
                }}
              >
                {/* 1. Text Layer */}
                {layer.type === 'text' && (
                  <div
                    className="w-full h-full flex items-center select-none"
                    style={{
                      fontFamily: `'${layer.font}', sans-serif`,
                      fontSize: `${layer.size * canvasWidth}px`,
                      fontWeight: layer.weight,
                      color: layer.color,
                      textAlign: layer.align,
                      direction: layer.direction,
                      lineHeight: layer.lineHeight,
                      letterSpacing: `${layer.letterSpacing}px`,
                      fontStyle: layer.italic ? 'italic' : 'normal',
                      textDecoration: [layer.underline && 'underline', layer.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
                      textTransform: layer.uppercase ? 'uppercase' : 'none',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      justifyContent: layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start',
                      filter:
                        layer.effect === 'shadow'
                          ? 'drop-shadow(0px 8px 18px rgba(0,0,0,0.85))'
                          : layer.effect === 'lift'
                            ? `drop-shadow(0px 0px 16px ${layer.effectColor || '#000000'})`
                            : undefined,
                      textShadow:
                        layer.effect === 'outline'
                          ? `-2px -2px 0 ${layer.effectColor || '#000'}, 2px -2px 0 ${layer.effectColor || '#000'}, -2px 2px 0 ${layer.effectColor || '#000'}, 2px 2px 0 ${layer.effectColor || '#000'}`
                          : undefined,
                      backgroundColor: layer.effect === 'pill' ? (layer.effectColor || 'rgba(0,0,0,0.6)') : undefined,
                      borderRadius: layer.effect === 'pill' ? '9999px' : undefined,
                      padding: layer.effect === 'pill' ? '4px 20px' : undefined,
                    }}
                  >
                    {layer.text}
                  </div>
                )}

                {/* 2. Shape Layer */}
                {layer.type === 'shape' && (
                  <div className="w-full h-full pointer-events-none">
                    {layer.shapeType === 'circle' ? (
                      <div
                        className="w-full h-full rounded-full"
                        style={{
                          backgroundColor: layer.fill,
                          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
                        }}
                      />
                    ) : layer.shapeType === 'triangle' ? (
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <polygon
                          points="50,5 95,95 5,95"
                          fill={layer.fill}
                          stroke={layer.stroke}
                          strokeWidth={layer.strokeWidth}
                        />
                      </svg>
                    ) : layer.shapeType === 'star' ? (
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <polygon
                          points="50,5 63,38 98,38 69,59 80,95 50,73 20,95 31,59 2,38 37,38"
                          fill={layer.fill}
                          stroke={layer.stroke}
                          strokeWidth={layer.strokeWidth}
                        />
                      </svg>
                    ) : layer.shapeType === 'diamond' ? (
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <polygon
                          points="50,5 95,50 50,95 5,50"
                          fill={layer.fill}
                          stroke={layer.stroke}
                          strokeWidth={layer.strokeWidth}
                        />
                      </svg>
                    ) : layer.shapeType === 'pill' ? (
                      <div
                        className="w-full h-full rounded-full"
                        style={{
                          backgroundColor: layer.fill,
                          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
                        }}
                      />
                    ) : layer.shapeType === 'divider' ? (
                      <div
                        className="w-full h-full rounded-xs"
                        style={{ backgroundColor: layer.fill }}
                      />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{
                          backgroundColor: layer.fill,
                          borderRadius: `${layer.borderRadius}px`,
                          border: `${layer.strokeWidth}px solid ${layer.stroke}`,
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 3. Icon Layer */}
                {layer.type === 'icon' && (
                  <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-full h-full"
                      fill="none"
                      stroke={layer.color}
                      strokeWidth={layer.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                )}

                {/* 4. Image Layer */}
                {layer.type === 'image' && (
                  <div
                    className="w-full h-full overflow-hidden pointer-events-none"
                    style={{
                      borderRadius: `${layer.borderRadius}px`,
                      transform: `${layer.flipX ? 'scaleX(-1)' : ''} ${layer.flipY ? 'scaleY(-1)' : ''}`,
                    }}
                  >
                    <img
                      src={layer.url || (layer.assetId ? imageUrl(layer.assetId) : '')}
                      alt={layer.name}
                      className="w-full h-full"
                      style={{ objectFit: layer.fit }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Canva Selection Overlay */}
          <SelectionOverlay
            selectedLayers={selectedLayers}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            scale={zoom}
            onStartResize={handleStartResize}
            onStartRotate={handleStartRotate}
            onDuplicate={() => onDuplicateLayers(selectedLayerIds)}
            onDelete={() => onRemoveLayers(selectedLayerIds)}
            onToggleLock={() => selectedLayers[0] && onToggleLock(selectedLayers[0].id)}
            onBringForward={onBringForward && selectedLayers[0] ? () => onBringForward(selectedLayers[0].id) : undefined}
            onSendBackward={onSendBackward && selectedLayers[0] ? () => onSendBackward(selectedLayers[0].id) : undefined}
            onBringToFront={onBringToFront && selectedLayers[0] ? () => onBringToFront(selectedLayers[0].id) : undefined}
            onSendToBack={onSendToBack && selectedLayers[0] ? () => onSendToBack(selectedLayers[0].id) : undefined}
          />
        </div>
      </div>
    </div>
  );
});
