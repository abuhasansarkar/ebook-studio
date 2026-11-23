"use client";

import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  Square,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import type { DesignLayer } from '@ebook/shared';

interface LayersPanelProps {
  layers: DesignLayer[];
  selectedLayerIds: string[];
  onSelectLayer: (id: string, isMulti?: boolean) => void;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRenameLayer: (id: string, newName: string) => void;
}

export function LayersPanel({
  layers,
  selectedLayerIds,
  onSelectLayer,
  onToggleLock,
  onToggleHide,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
  onRenameLayer,
}: LayersPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Stack order: top-most layer at top of list
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  const startRename = (layer: DesignLayer) => {
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) {
      onRenameLayer(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
        <span>Layers Stack ({layers.length})</span>
      </div>

      <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
        {sortedLayers.map((layer, index) => {
          const isSelected = selectedLayerIds.includes(layer.id);
          const LayerIcon =
            layer.type === 'text'
              ? Type
              : layer.type === 'shape'
                ? Square
                : layer.type === 'image'
                  ? ImageIcon
                  : Sparkles;

          return (
            <div
              key={layer.id}
              onClick={(e) => onSelectLayer(layer.id, e.shiftKey)}
              className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all cursor-pointer group select-none ${
                isSelected
                  ? 'border-primary bg-primary-soft/40 shadow-xs'
                  : 'border-border/60 bg-surface hover:bg-muted/40 hover:border-border'
              }`}
            >
              {/* Left: Icon & Name */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <LayerIcon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />

                {editingId === layer.id ? (
                  <input
                    type="text"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => commitRename(layer.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(layer.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full h-6 px-1 rounded border border-primary bg-surface text-xs font-medium focus:outline-hidden"
                  />
                ) : (
                  <span
                    onDoubleClick={() => startRename(layer)}
                    className={`truncate font-medium ${layer.hidden ? 'opacity-40 line-through' : ''}`}
                    title="Double click to rename"
                  >
                    {layer.name}
                  </span>
                )}
              </div>

              {/* Right: Layer Controls */}
              <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                {/* Move Up/Down */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBringForward(layer.id); }}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                  title="Move Up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSendBackward(layer.id); }}
                  disabled={index === sortedLayers.length - 1}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                  title="Move Down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>

                {/* Hide / Show */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleHide(layer.id); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title={layer.hidden ? 'Show layer' : 'Hide layer'}
                >
                  {layer.hidden ? <EyeOff className="h-3 w-3 text-muted-foreground/60" /> : <Eye className="h-3 w-3" />}
                </button>

                {/* Lock / Unlock */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                >
                  {layer.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
                  className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 cursor-pointer"
                  title="Delete layer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
