"use client";

import React, { memo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3X3,
  Ruler,
  ShieldCheck,
  History,
  Download,
  Save,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EditorHeaderProps {
  bookId: string;
  bookTitle?: string;
  savedVersion: number;
  dirty: boolean;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  showRulers: boolean;
  showGuides: boolean;
  showSafeMargin: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onToggleRulers: () => void;
  onToggleGuides: () => void;
  onToggleSafeMargin: () => void;
  onSave: () => void;
  onOpenExport: () => void;
  onOpenHistory: () => void;
  onOpenAi: () => void;
}

export const EditorHeader = memo(function EditorHeader({
  bookId,
  bookTitle,
  savedVersion,
  dirty,
  busy,
  canUndo,
  canRedo,
  zoom,
  showRulers,
  showGuides,
  showSafeMargin,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onToggleRulers,
  onToggleGuides,
  onToggleSafeMargin,
  onSave,
  onOpenExport,
  onOpenHistory,
  onOpenAi,
}: EditorHeaderProps) {
  return (
    <header className="h-14 border-b border-border/80 bg-surface/90 backdrop-blur-md px-4 flex items-center justify-between gap-3 shrink-0 z-50">
      {/* Left: Back & Title */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/app/books/${bookId}`}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Back to Book"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate max-w-56" title={bookTitle || 'Cover Studio'}>
            {bookTitle || 'Book Cover Studio'}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 transition-colors ${
              dirty
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
            }`}
          >
            {busy ? 'Saving…' : dirty ? 'Unsaved' : `Saved v${savedVersion}`}
          </span>
        </div>
      </div>

      {/* Center: History & View Controls */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/50">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || busy}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:pointer-events-none text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || busy}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:pointer-events-none text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="h-3 w-px bg-border/60 mx-1" />

        {/* Zoom Controls */}
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-mono px-1 select-none text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onZoomFit}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Fit to Screen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <div className="h-3 w-px bg-border/60 mx-1" />

        {/* View Toggles */}
        <button
          type="button"
          onClick={onToggleRulers}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showRulers ? 'bg-primary-soft text-primary font-bold' : 'text-muted-foreground hover:bg-muted'
          }`}
          title="Toggle Rulers"
        >
          <Ruler className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleGuides}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showGuides ? 'bg-primary-soft text-primary font-bold' : 'text-muted-foreground hover:bg-muted'
          }`}
          title="Toggle Grid Guidelines"
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleSafeMargin}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showSafeMargin ? 'bg-primary-soft text-primary font-bold' : 'text-muted-foreground hover:bg-muted'
          }`}
          title="Toggle Kindle Safe Margin Overlay"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenAi}
          className="gap-1.5 hidden sm:inline-flex text-xs"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>AI Generator</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenHistory}
          className="gap-1.5 hidden md:inline-flex text-xs"
        >
          <History className="h-3.5 w-3.5" />
          <span>History</span>
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={busy || (!dirty && savedVersion > 0)}
          onClick={onSave}
          className="gap-1.5 text-xs font-semibold"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span>Save Cover</span>
        </Button>

        <Button
          size="sm"
          onClick={onOpenExport}
          className="gap-1.5 text-xs font-semibold shadow-xs"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export</span>
        </Button>
      </div>
    </header>
  );
});
