"use client";

import React, { memo, useState } from 'react';
import { Layers, Sliders, ChevronRight, ChevronLeft } from 'lucide-react';
import type { DesignLayer } from '@ebook/shared';
import { LayersPanel } from './layers-panel';
import { PropertiesPanel } from './properties-panel';

interface EditorPropertiesPanelProps {
  layers: DesignLayer[];
  selectedLayerIds: string[];
  primarySelectedLayer: DesignLayer | null;
  backgroundColor: string;
  shade: number;
  onSelectLayer: (id: string, isMulti?: boolean) => void;
  onUpdateLayer: (id: string, patch: Partial<DesignLayer>) => void;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const EditorPropertiesPanel = memo(function EditorPropertiesPanel({
  layers,
  selectedLayerIds,
  primarySelectedLayer,
  backgroundColor,
  shade,
  onSelectLayer,
  onUpdateLayer,
  onToggleLock,
  onToggleHide,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
}: EditorPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'properties'>('layers');
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-10 border-l border-border/80 bg-surface flex flex-col items-center py-3 z-30 select-none">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          title="Expand Panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-72 h-full border-l border-border/80 bg-surface flex flex-col z-30 select-none shrink-0">
      {/* Top Tabs */}
      <div className="h-10 border-b border-border/80 px-2 flex items-center justify-between gap-1 shrink-0 bg-muted/20">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('layers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'layers'
                ? 'bg-surface text-primary shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Layers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'properties'
                ? 'bg-surface text-primary shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Properties</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          title="Collapse Panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'layers' ? (
          <LayersPanel
            layers={layers}
            selectedLayerIds={selectedLayerIds}
            onSelectLayer={onSelectLayer}
            onToggleLock={onToggleLock}
            onToggleHide={onToggleHide}
            onBringForward={onBringForward}
            onSendBackward={onSendBackward}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onRenameLayer={(id, name) => onUpdateLayer(id, { name })}
          />
        ) : (
          <PropertiesPanel
            layer={primarySelectedLayer}
            backgroundColor={backgroundColor}
            shade={shade}
            onUpdateLayer={onUpdateLayer}
          />
        )}
      </div>
    </aside>
  );
});
