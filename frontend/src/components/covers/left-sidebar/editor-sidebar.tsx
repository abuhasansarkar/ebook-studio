"use client";

import React, { memo } from 'react';
import {
  LayoutTemplate,
  Shapes,
  Type,
  UploadCloud,
  Palette,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import type { EditorTab, TemplateDefinition } from '../types';
import type { ShapeLayer, TextLayer, CoverDesign } from '@ebook/shared';
import { TemplatesTab } from './tabs/templates-tab';
import { ElementsTab } from './tabs/elements-tab';
import { TextTab } from './tabs/text-tab';
import { UploadsTab } from './tabs/uploads-tab';
import { BackgroundsTab } from './tabs/backgrounds-tab';
import { AiDesignerTab } from './tabs/ai-designer-tab';
import type { SavedCover } from '../types';

interface EditorSidebarProps {
  activeTab: EditorTab;
  onSelectTab: (tab: EditorTab) => void;
  bookId: string;
  currentDesign?: CoverDesign;
  backgroundColor: string;
  shade: number;
  hasArtwork: boolean;
  onApplyTemplate: (template: TemplateDefinition) => void;
  onAddShape: (shape: Partial<ShapeLayer>) => void;
  onAddIcon: (iconName: string) => void;
  onAddText: (textLayer: Partial<TextLayer>) => void;
  onAddImageLayer: (url: string, name?: string) => void;
  onSetBackgroundArtwork: (url: string) => void;
  onOpenAssetLibrary: () => void;
  onSetBackground: (color: string) => void;
  onSetShade: (shade: number) => void;
  onRemoveArtwork: () => void;
  onApplyCover: (cover: SavedCover) => void;
  onSetArtwork: (assetId: string) => void;
}

const RAIL_ITEMS = [
  { id: 'templates' as const, label: 'Templates', icon: LayoutTemplate },
  { id: 'elements' as const, label: 'Elements', icon: Shapes },
  { id: 'text' as const, label: 'Text', icon: Type },
  { id: 'uploads' as const, label: 'Uploads', icon: UploadCloud },
  { id: 'backgrounds' as const, label: 'Background', icon: Palette },
  { id: 'ai' as const, label: 'AI Images', icon: Sparkles },
];

export const EditorSidebar = memo(function EditorSidebar({
  activeTab,
  onSelectTab,
  bookId,
  currentDesign,
  backgroundColor,
  shade,
  hasArtwork,
  onApplyTemplate,
  onAddShape,
  onAddIcon,
  onAddText,
  onAddImageLayer,
  onSetBackgroundArtwork,
  onOpenAssetLibrary,
  onSetBackground,
  onSetShade,
  onRemoveArtwork,
  onApplyCover,
  onSetArtwork,
}: EditorSidebarProps) {
  return (
    <div className="flex h-full z-40 shrink-0">
      {/* 64px Navigation Rail */}
      <nav className="w-16 h-full border-r border-border/80 bg-surface flex flex-col items-center py-3 gap-1 z-30 select-none">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(isActive ? null : item.id)}
              className={`w-13 py-2 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer group ${
                isActive
                  ? 'bg-primary-soft text-primary font-bold shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span className="text-[10px] tracking-tight mt-1 truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Slide-out Sub-panel Drawer */}
      {activeTab && (
        <aside className="w-80 h-full border-r border-border/80 bg-surface/95 backdrop-blur-md flex flex-col relative z-20 shadow-xl overflow-hidden animate-in slide-in-from-left-4 duration-200">
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'templates' && (
              <TemplatesTab currentDesign={currentDesign} onApplyTemplate={onApplyTemplate} />
            )}
            {activeTab === 'elements' && (
              <ElementsTab onAddShape={onAddShape} onAddIcon={onAddIcon} />
            )}
            {activeTab === 'text' && (
              <TextTab onAddText={onAddText} />
            )}
            {activeTab === 'uploads' && (
              <UploadsTab
                onOpenAssetLibrary={onOpenAssetLibrary}
                onAddImageLayer={onAddImageLayer}
                onSetBackgroundArtwork={onSetBackgroundArtwork}
              />
            )}
            {activeTab === 'backgrounds' && (
              <BackgroundsTab
                backgroundColor={backgroundColor}
                shade={shade}
                hasArtwork={hasArtwork}
                onSetBackground={onSetBackground}
                onSetShade={onSetShade}
                onRemoveArtwork={onRemoveArtwork}
              />
            )}
            {activeTab === 'ai' && (
              <AiDesignerTab
                bookId={bookId}
                onApplyCover={onApplyCover}
                onSetArtwork={onSetArtwork}
                onAddImageLayer={onAddImageLayer}
              />
            )}
          </div>

          {/* Close drawer button */}
          <button
            type="button"
            onClick={() => onSelectTab(null)}
            className="absolute top-2 right-2 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </aside>
      )}
    </div>
  );
});
