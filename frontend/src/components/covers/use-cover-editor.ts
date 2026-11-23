"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  type CoverDesign,
  type DesignLayer,
  type TextLayer,
  type ShapeLayer,
  type ImageLayer,
  type IconLayer,
  type CanvasSettings,
  synthesizeLayersFromLegacy,
  syncLegacyFieldsFromLayers,
  COVER_WIDTH,
  COVER_HEIGHT,
} from '@ebook/shared';
import type { EditorTab, AlignmentGuide, SavedCover } from './types';

interface HistorySnapshot {
  design: CoverDesign;
  selectedLayerIds: string[];
}

export type NewLayerInput =
  | (Partial<TextLayer> & { type: 'text' })
  | (Partial<ShapeLayer> & { type: 'shape' })
  | (Partial<IconLayer> & { type: 'icon' })
  | (Partial<ImageLayer> & { type: 'image' });

export function useCoverEditor(initial: SavedCover, ownerId: string, bookId: string) {
  // Ensure layers are synthesized from legacy title/subtitle/author if not present
  const initialDesign = useMemo<CoverDesign>(() => {
    const layers = synthesizeLayersFromLegacy(initial.data);
    return {
      ...initial.data,
      layers,
      canvas: initial.data.canvas || {
        width: COVER_WIDTH,
        height: COVER_HEIGHT,
        unit: 'px',
        preset: 'kindle',
      },
    };
  }, [initial.data]);

  const [design, setDesign] = useState<CoverDesign>(initialDesign);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<EditorTab>('templates');
  const [zoom, setZoom] = useState(0.4);
  const [showRulers, setShowRulers] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [showSafeMargin, setShowSafeMargin] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // 50-step Undo / Redo history
  const [history, setHistory] = useState<HistorySnapshot[]>([
    { design: initialDesign, selectedLayerIds: [] },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const isUndoRedoAction = useRef(false);

  // Push new state to history
  const pushHistory = useCallback((newDesign: CoverDesign, newSelectedIds?: string[]) => {
    if (isUndoRedoAction.current) return;
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const snapshot: HistorySnapshot = {
        design: newDesign,
        selectedLayerIds: newSelectedIds !== undefined ? newSelectedIds : selectedLayerIds,
      };
      const nextHistory = [...trimmed, snapshot].slice(-50);
      setHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }, [historyIndex, selectedLayerIds]);

  const updateDesign = useCallback((updater: (prev: CoverDesign) => CoverDesign, recordHistory = true) => {
    setDesign((prev) => {
      const next = updater(prev);
      if (recordHistory) {
        pushHistory(next);
      }
      return next;
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const targetIndex = historyIndex - 1;
      const snapshot = history[targetIndex];
      setDesign(snapshot.design);
      setSelectedLayerIds(snapshot.selectedLayerIds);
      setHistoryIndex(targetIndex);
      setTimeout(() => { isUndoRedoAction.current = false; }, 50);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const targetIndex = historyIndex + 1;
      const snapshot = history[targetIndex];
      setDesign(snapshot.design);
      setSelectedLayerIds(snapshot.selectedLayerIds);
      setHistoryIndex(targetIndex);
      setTimeout(() => { isUndoRedoAction.current = false; }, 50);
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Selected layers helper
  const selectedLayers = useMemo(() => {
    const list = design.layers || [];
    return list.filter((l) => selectedLayerIds.includes(l.id));
  }, [design.layers, selectedLayerIds]);

  const primarySelectedLayer = selectedLayers[0] || null;

  // Selection actions
  const selectLayer = useCallback((id: string, isMulti = false) => {
    setSelectedLayerIds((prev) => {
      if (isMulti) {
        return prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      }
      return [id];
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = (design.layers || []).map((l) => l.id);
    setSelectedLayerIds(allIds);
  }, [design.layers]);

  const deselectAll = useCallback(() => {
    setSelectedLayerIds([]);
  }, []);

  // Layer CRUD
  const addLayer = useCallback((layerInput: NewLayerInput) => {
    const id =
      layerInput.id ||
      `${layerInput.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let fullLayer: DesignLayer;

    if (layerInput.type === 'text') {
      fullLayer = {
        id,
        type: 'text',
        name: layerInput.name || 'Text Layer',
        role: layerInput.role || 'custom',
        x: layerInput.x ?? 0.1,
        y: layerInput.y ?? 0.4,
        width: layerInput.width ?? 0.8,
        height: layerInput.height ?? 0.08,
        rotation: layerInput.rotation ?? 0,
        opacity: layerInput.opacity ?? 1,
        locked: layerInput.locked ?? false,
        hidden: layerInput.hidden ?? false,
        zIndex: 0,
        text: layerInput.text || 'Heading Text',
        font: layerInput.font || 'Montserrat',
        size: layerInput.size ?? 0.035,
        color: layerInput.color || '#ffffff',
        weight: layerInput.weight || '700',
        italic: layerInput.italic ?? false,
        underline: layerInput.underline ?? false,
        strike: layerInput.strike ?? false,
        uppercase: layerInput.uppercase ?? false,
        align: layerInput.align || 'center',
        direction: layerInput.direction || 'ltr',
        letterSpacing: layerInput.letterSpacing ?? 0,
        lineHeight: layerInput.lineHeight ?? 1.2,
        effect: layerInput.effect || 'none',
        effectColor: layerInput.effectColor,
      };
    } else if (layerInput.type === 'shape') {
      fullLayer = {
        id,
        type: 'shape',
        name: layerInput.name || 'Shape',
        shapeType: layerInput.shapeType || 'rectangle',
        fill: layerInput.fill || '#ffffff',
        stroke: layerInput.stroke || 'transparent',
        strokeWidth: layerInput.strokeWidth ?? 0,
        borderRadius: layerInput.borderRadius ?? 0,
        x: layerInput.x ?? 0.25,
        y: layerInput.y ?? 0.45,
        width: layerInput.width ?? 0.5,
        height: layerInput.height ?? 0.1,
        rotation: layerInput.rotation ?? 0,
        opacity: layerInput.opacity ?? 1,
        locked: layerInput.locked ?? false,
        hidden: layerInput.hidden ?? false,
        zIndex: 0,
      };
    } else if (layerInput.type === 'icon') {
      fullLayer = {
        id,
        type: 'icon',
        name: layerInput.name || 'Icon',
        iconName: layerInput.iconName || 'star',
        color: layerInput.color || '#ffffff',
        strokeWidth: layerInput.strokeWidth ?? 2,
        x: layerInput.x ?? 0.45,
        y: layerInput.y ?? 0.45,
        width: layerInput.width ?? 0.1,
        height: layerInput.height ?? 0.06,
        rotation: layerInput.rotation ?? 0,
        opacity: layerInput.opacity ?? 1,
        locked: layerInput.locked ?? false,
        hidden: layerInput.hidden ?? false,
        zIndex: 0,
      };
    } else {
      fullLayer = {
        id,
        type: 'image',
        name: layerInput.name || 'Image',
        url: layerInput.url,
        assetId: layerInput.assetId,
        fit: layerInput.fit || 'cover',
        borderRadius: layerInput.borderRadius ?? 0,
        flipX: layerInput.flipX ?? false,
        flipY: layerInput.flipY ?? false,
        x: layerInput.x ?? 0.2,
        y: layerInput.y ?? 0.3,
        width: layerInput.width ?? 0.6,
        height: layerInput.height ?? 0.4,
        rotation: layerInput.rotation ?? 0,
        opacity: layerInput.opacity ?? 1,
        locked: layerInput.locked ?? false,
        hidden: layerInput.hidden ?? false,
        zIndex: 0,
      };
    }

    updateDesign((prev) => {
      const currentLayers = prev.layers || [];
      const maxZ = currentLayers.reduce((max, l) => Math.max(max, l.zIndex), 0);
      fullLayer.zIndex = maxZ + 1;
      return {
        ...prev,
        layers: [...currentLayers, fullLayer],
      };
    });
    setSelectedLayerIds([fullLayer.id]);
  }, [updateDesign]);

  const updateLayer = useCallback((id: string, patch: Partial<DesignLayer>, recordHistory = true) => {
    updateDesign((prev) => {
      const layers = (prev.layers || []).map((l) => {
        if (l.id === id) {
          return { ...l, ...patch } as DesignLayer;
        }
        return l;
      });
      return { ...prev, layers };
    }, recordHistory);
  }, [updateDesign]);

  const updateSelectedLayers = useCallback((patch: Partial<DesignLayer>, recordHistory = true) => {
    updateDesign((prev) => {
      const layers = (prev.layers || []).map((l) => {
        if (selectedLayerIds.includes(l.id)) {
          return { ...l, ...patch } as DesignLayer;
        }
        return l;
      });
      return { ...prev, layers };
    }, recordHistory);
  }, [selectedLayerIds, updateDesign]);

  const removeLayers = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    updateDesign((prev) => ({
      ...prev,
      layers: (prev.layers || []).filter((l) => !ids.includes(l.id)),
    }));
    setSelectedLayerIds((prev) => prev.filter((id) => !ids.includes(id)));
  }, [updateDesign]);

  const duplicateLayers = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const newIds: string[] = [];
    updateDesign((prev) => {
      const currentLayers = prev.layers || [];
      const duplicates: DesignLayer[] = [];
      const maxZ = currentLayers.reduce((max, l) => Math.max(max, l.zIndex), 0);

      currentLayers.forEach((l, index) => {
        if (ids.includes(l.id)) {
          const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          newIds.push(newId);
          duplicates.push({
            ...l,
            id: newId,
            name: `${l.name} (Copy)`,
            x: Math.min(0.85, l.x + 0.02),
            y: Math.min(0.85, l.y + 0.02),
            zIndex: maxZ + 1 + index,
          } as DesignLayer);
        }
      });

      return {
        ...prev,
        layers: [...currentLayers, ...duplicates],
      };
    });
    setSelectedLayerIds(newIds);
  }, [updateDesign]);

  const toggleLock = useCallback((id: string) => {
    updateDesign((prev) => ({
      ...prev,
      layers: (prev.layers || []).map((l) => (l.id === id ? { ...l, locked: !l.locked } as DesignLayer : l)),
    }));
  }, [updateDesign]);

  const toggleHide = useCallback((id: string) => {
    updateDesign((prev) => ({
      ...prev,
      layers: (prev.layers || []).map((l) => (l.id === id ? { ...l, hidden: !l.hidden } as DesignLayer : l)),
    }));
  }, [updateDesign]);

  // Reordering & Z-Index
  const bringForward = useCallback((id: string) => {
    updateDesign((prev) => {
      const layers = [...(prev.layers || [])];
      const index = layers.findIndex((l) => l.id === id);
      if (index < layers.length - 1) {
        const temp = layers[index];
        layers[index] = layers[index + 1];
        layers[index + 1] = temp;
        // re-index zIndex
        layers.forEach((l, i) => { l.zIndex = i + 1; });
      }
      return { ...prev, layers };
    });
  }, [updateDesign]);

  const sendBackward = useCallback((id: string) => {
    updateDesign((prev) => {
      const layers = [...(prev.layers || [])];
      const index = layers.findIndex((l) => l.id === id);
      if (index > 0) {
        const temp = layers[index];
        layers[index] = layers[index - 1];
        layers[index - 1] = temp;
        layers.forEach((l, i) => { l.zIndex = i + 1; });
      }
      return { ...prev, layers };
    });
  }, [updateDesign]);

  const bringToFront = useCallback((id: string) => {
    updateDesign((prev) => {
      const layers = (prev.layers || []).filter((l) => l.id !== id);
      const target = (prev.layers || []).find((l) => l.id === id);
      if (!target) return prev;
      const reordered = [...layers, target];
      reordered.forEach((l, i) => { l.zIndex = i + 1; });
      return { ...prev, layers: reordered };
    });
  }, [updateDesign]);

  const sendToBack = useCallback((id: string) => {
    updateDesign((prev) => {
      const layers = (prev.layers || []).filter((l) => l.id !== id);
      const target = (prev.layers || []).find((l) => l.id === id);
      if (!target) return prev;
      const reordered = [target, ...layers];
      reordered.forEach((l, i) => { l.zIndex = i + 1; });
      return { ...prev, layers: reordered };
    });
  }, [updateDesign]);

  // Alignment helpers for multiple selected elements
  const alignSelected = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedLayers.length < 2) return;
    updateDesign((prev) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      selectedLayers.forEach((l) => {
        minX = Math.min(minX, l.x);
        maxX = Math.max(maxX, l.x + l.width);
        minY = Math.min(minY, l.y);
        maxY = Math.max(maxY, l.y + l.height);
      });
      const centerX = (minX + maxX) / 2;
      const middleY = (minY + maxY) / 2;

      const layers = (prev.layers || []).map((l) => {
        if (!selectedLayerIds.includes(l.id) || l.locked) return l;
        let x = l.x;
        let y = l.y;
        if (alignment === 'left') x = minX;
        if (alignment === 'center') x = centerX - l.width / 2;
        if (alignment === 'right') x = maxX - l.width;
        if (alignment === 'top') y = minY;
        if (alignment === 'middle') y = middleY - l.height / 2;
        if (alignment === 'bottom') y = maxY - l.height;
        return { ...l, x, y } as DesignLayer;
      });

      return { ...prev, layers };
    });
  }, [selectedLayers, selectedLayerIds, updateDesign]);

  // Background & Artwork
  const setBackground = useCallback((background: string) => {
    updateDesign((prev) => ({ ...prev, background }));
  }, [updateDesign]);

  const setShade = useCallback((shade: number) => {
    updateDesign((prev) => ({ ...prev, shade }));
  }, [updateDesign]);

  const setArtworkId = useCallback((artworkId: string | null) => {
    updateDesign((prev) => ({ ...prev, artworkId }));
  }, [updateDesign]);

  // Typography Formatting Helpers
  const toggleBold = useCallback(() => {
    if (!primarySelectedLayer || primarySelectedLayer.type !== 'text') return;
    const currentWeight = (primarySelectedLayer as TextLayer).weight;
    const nextWeight = currentWeight === '700' || currentWeight === '800' || currentWeight === '900' ? '400' : '700';
    updateLayer(primarySelectedLayer.id, { weight: nextWeight });
  }, [primarySelectedLayer, updateLayer]);

  const toggleItalic = useCallback(() => {
    if (!primarySelectedLayer || primarySelectedLayer.type !== 'text') return;
    updateLayer(primarySelectedLayer.id, { italic: !(primarySelectedLayer as TextLayer).italic });
  }, [primarySelectedLayer, updateLayer]);

  const toggleUnderline = useCallback(() => {
    if (!primarySelectedLayer || primarySelectedLayer.type !== 'text') return;
    updateLayer(primarySelectedLayer.id, { underline: !(primarySelectedLayer as TextLayer).underline });
  }, [primarySelectedLayer, updateLayer]);

  const toggleStrike = useCallback(() => {
    if (!primarySelectedLayer || primarySelectedLayer.type !== 'text') return;
    updateLayer(primarySelectedLayer.id, { strike: !(primarySelectedLayer as TextLayer).strike });
  }, [primarySelectedLayer, updateLayer]);

  const toggleUppercase = useCallback(() => {
    if (!primarySelectedLayer || primarySelectedLayer.type !== 'text') return;
    updateLayer(primarySelectedLayer.id, { uppercase: !(primarySelectedLayer as TextLayer).uppercase });
  }, [primarySelectedLayer, updateLayer]);

  // Canvas Settings
  const setDimensionsPreset = useCallback((preset: CanvasSettings['preset']) => {
    let width = COVER_WIDTH;
    let height = COVER_HEIGHT;
    if (preset === 'paperback_6x9') {
      width = 1800;
      height = 2700;
    } else if (preset === 'square') {
      width = 2400;
      height = 2400;
    }
    updateDesign((prev) => ({
      ...prev,
      canvas: {
        width,
        height,
        unit: 'px',
        preset,
      },
    }));
  }, [updateDesign]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom((z) => Math.min(1.5, z + 0.05)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.15, z - 0.05)), []);

  // Sync legacy fields before save/export
  const getPreparedDesign = useCallback((): CoverDesign => {
    const layers = design.layers || [];
    const syncedLegacy = syncLegacyFieldsFromLayers(
      layers,
      design.title,
      design.subtitle,
      design.author
    );
    return {
      ...design,
      title: syncedLegacy.title,
      subtitle: syncedLegacy.subtitle,
      author: syncedLegacy.author,
      layers,
    };
  }, [design]);

  return {
    design,
    setDesign,
    updateDesign,
    selectedLayerIds,
    selectedLayers,
    primarySelectedLayer,
    activeTab,
    setActiveTab,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    showRulers,
    setShowRulers,
    showGuides,
    setShowGuides,
    showSafeMargin,
    setShowSafeMargin,
    snapToGrid,
    setSnapToGrid,
    alignmentGuides,
    setAlignmentGuides,
    history,
    historyIndex,
    undo,
    redo,
    canUndo,
    canRedo,
    selectLayer,
    selectAll,
    deselectAll,
    addLayer,
    updateLayer,
    updateSelectedLayers,
    removeLayers,
    duplicateLayers,
    toggleLock,
    toggleHide,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    alignSelected,
    setBackground,
    setShade,
    setArtworkId,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrike,
    toggleUppercase,
    setDimensionsPreset,
    getPreparedDesign,
  };
}
