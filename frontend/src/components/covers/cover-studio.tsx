"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  History,
  Clock,
  Loader2,
  FileImage,
  Palette,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  COVER_FONTS,
  COVER_HEIGHT,
  COVER_WIDTH,
  coverDesignSchema,
  type CoverDesign,
  type DesignLayer,
  type TextLayer,
  type ShapeLayer,
  type CanvasSettings,
} from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { operationRequest } from '@/lib/operation-request';
import { useSession } from '@/lib/auth-client';
import { useBook } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { AssetLibrary, imageUrl } from '@/components/assets/asset-library';
import { timeAgo } from '@/lib/utils';

// Canva-style modular components
import { EditorHeader } from './top-bar/editor-header';
import { ContextualToolbar } from './top-bar/contextual-toolbar';
import { EditorSidebar } from './left-sidebar/editor-sidebar';
import { DesignCanvas } from './canvas/design-canvas';
import { EditorPropertiesPanel } from './right-panel/editor-properties-panel';
import { ExportModal } from './export/export-modal';
import { useCoverEditor } from './use-cover-editor';
import { applyTemplateToDesign } from './templates/cover-templates';
import type { SavedCover, CoverVersionMeta, TemplateDefinition, EditorTab } from './types';

const STYLE_OPTIONS = [
  { value: 'modern', label: 'Modern & Sleek' },
  { value: 'minimalist', label: 'Minimalist & Clean' },
  { value: 'business', label: 'Professional Business / Corporate' },
  { value: 'tech', label: 'Technology & Digital' },
  { value: 'finance', label: 'Finance & Wealth' },
  { value: 'marketing', label: 'Marketing & Growth' },
  { value: 'fiction', label: 'Fiction & Literary' },
  { value: 'romance', label: 'Romance & Drama' },
  { value: 'mystery', label: 'Mystery & Thriller' },
  { value: 'fantasy', label: 'Epic Fantasy & Magic' },
  { value: 'scifi', label: 'Science Fiction & Space' },
  { value: 'children', label: "Children's Illustrated & Storybook" },
  { value: 'wellness', label: 'Health & Wellness' },
  { value: 'artistic', label: 'Creative & Artistic' },
];

export function CoverStudio({ bookId }: { bookId: string }) {
  const { data: session } = useSession();
  const bookQuery = useBook(bookId);
  const coverQuery = useQuery({
    queryKey: ['cover', session?.user.id, bookId],
    queryFn: () => api.get<{ cover: SavedCover }>(`/books/${bookId}/cover`),
    enabled: !!session,
  });

  if (coverQuery.error) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4">
        <Alert tone="danger">{errorMessage(coverQuery.error)}</Alert>
        <Button onClick={() => void coverQuery.refetch()}>Retry loading cover</Button>
      </div>
    );
  }

  if (!coverQuery.data || !session) {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center space-x-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm font-medium text-muted-foreground">Loading Canva Cover Studio…</span>
      </div>
    );
  }

  return (
    <CoverWorkspace
      key={`${session.user.id}:${bookId}`}
      bookId={bookId}
      ownerId={session.user.id}
      initial={coverQuery.data.cover}
      bookTitle={bookQuery.data?.title}
      bookAuthor={bookQuery.data?.author ?? session.user.name}
    />
  );
}

function CoverWorkspace({
  bookId,
  ownerId,
  initial,
  bookTitle,
  bookAuthor,
}: {
  bookId: string;
  ownerId: string;
  initial: SavedCover;
  bookTitle?: string;
  bookAuthor?: string;
}) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState<SavedCover>(initial);
  const [baseVersion, setBaseVersion] = useState(initial.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discardConflict, setDiscardConflict] = useState(false);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState<SavedCover | null>(null);

  // Full Screen State & Ref
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [exportOpen, setExportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetInsertTarget, setAssetInsertTarget] = useState<'background' | 'layer'>('background');
  const [templatePending, setTemplatePending] = useState<TemplateDefinition | null>(null);

  // Editor hook
  const editor = useCoverEditor(saved, ownerId, bookId);
  const dirty = useMemo(() => {
    return JSON.stringify(editor.design) !== JSON.stringify(saved.data);
  }, [editor.design, saved.data]);

  // Load Google Fonts on client
  useEffect(() => {
    const linkId = 'google-cover-fonts-link';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=Lora:ital,wght@0,400..700;1,400..700&family=Merriweather:ital,wght@0,300..900;1,300..900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Oswald:wght@200..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const draftKey = `ebook-cover-canva:${ownerId}:${bookId}`;

  // Toggle Canvas Fullscreen Mode
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      workspaceRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcut (F / Esc) & Fullscreen Change Listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, toggleFullscreen]);

  const forgetDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      setStorageWarning('Browser draft storage is unavailable.');
    }
  }, [draftKey]);

  // Restore draft from sessionStorage on mount
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedCover;
          if (Number.isInteger(parsed.version) && parsed.version >= 0) {
            setRecovery({
              version: parsed.version,
              data: coverDesignSchema.parse(parsed.data),
            });
          }
        }
      } catch {
        setStorageWarning('Browser draft could not be read.');
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [draftKey]);

  // Sync draft to sessionStorage
  useEffect(() => {
    if (!ready || recovery) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        if (dirty) {
          sessionStorage.setItem(
            draftKey,
            JSON.stringify({ version: baseVersion, data: editor.design })
          );
        } else {
          sessionStorage.removeItem(draftKey);
        }
      } catch {
        setStorageWarning('Browser draft storage is unavailable.');
      }
    });
    return () => {
      active = false;
    };
  }, [ready, recovery, dirty, draftKey, baseVersion, editor.design]);

  // Warn on tab leave when dirty
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      window.removeEventListener('beforeunload', leave);
    };
  }, [dirty]);

  // Save Cover
  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const prepared = editor.getPreparedDesign();
      const parsed = coverDesignSchema.safeParse(prepared);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. ')
        );
      }
      const result = await api.put<{ cover: SavedCover }>(`/books/${bookId}/cover`, {
        baseVersion,
        data: parsed.data,
      });

      setSaved(result.cover);
      editor.setDesign(result.cover.data);
      setBaseVersion(result.cover.version);
      setConflict(false);
      forgetDraft();
      toast.success(`Cover saved successfully as Version ${result.cover.version}!`);
      void qc.invalidateQueries({ queryKey: ['cover', ownerId, bookId] });
      void qc.invalidateQueries({ queryKey: ['books'] });
    } catch (e) {
      setError(errorMessage(e));
      if (typeof e === 'object' && e && 'status' in e && e.status === 409) {
        setConflict(true);
      }
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Conflict Resolution
  const handleResolveConflict = async (keep: boolean) => {
    setBusy(true);
    setError('');
    try {
      const latest = (await api.get<{ cover: SavedCover }>(`/books/${bookId}/cover`)).cover;
      setSaved(latest);
      setBaseVersion(latest.version);
      if (!keep) {
        editor.setDesign(latest.data);
        forgetDraft();
        toast.info(`Loaded latest cover Version ${latest.version}.`);
      } else {
        toast.info('Retained local draft. You can now save it over the latest version.');
      }
      setConflict(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Template Application
  const handleSelectTemplate = (template: TemplateDefinition) => {
    setTemplatePending(template);
  };

  const handleConfirmTemplate = (preserveBookInfo: boolean) => {
    if (!templatePending) return;
    const nextDesign = applyTemplateToDesign(
      templatePending,
      editor.design,
      preserveBookInfo ? bookTitle : undefined,
      preserveBookInfo ? bookAuthor : undefined
    );
    editor.setDesign(nextDesign);
    toast.success(`Applied template "${templatePending.title}"!`);
    setTemplatePending(null);
  };

  // Asset Insertion
  const handleAssetSelect = (asset: { id: string; originalFilename?: string }) => {
    if (assetInsertTarget === 'background') {
      editor.setArtworkId(asset.id);
      toast.success('Applied artwork to background.');
    } else {
      editor.addLayer({
        type: 'image',
        name: asset.originalFilename || 'Custom Image',
        url: imageUrl(asset.id),
        assetId: asset.id,
        x: 0.25,
        y: 0.35,
        width: 0.5,
        height: 0.3,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
      });
      toast.success('Added image layer.');
    }
    setAssetPickerOpen(false);
  };

  // Dimensions Preset
  const handleSetDimensionsPreset = (preset: CanvasSettings['preset']) => {
    editor.setDimensionsPreset(preset);
    toast.info(`Canvas updated to ${preset} preset.`);
  };

  return (
    <div
      ref={workspaceRef}
      className={`flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen bg-background' : 'h-[calc(100vh-64px)] w-full'
      } overflow-hidden bg-background select-none`}
    >
      {/* Dynamic Font Styles */}
      <style>{COVER_FONTS.map(font => `@font-face{font-family:${font};src:url('/api/v1/cover-fonts/${font}') format('truetype');font-weight:100 900;font-display:block}`).join('\n')}</style>

      {/* Editor Top Bar */}
      <EditorHeader
        bookId={bookId}
        bookTitle={bookTitle}
        savedVersion={saved.version}
        dirty={dirty}
        busy={busy}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        zoom={editor.zoom}
        showRulers={editor.showRulers}
        showGuides={editor.showGuides}
        showSafeMargin={editor.showSafeMargin}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onZoomIn={editor.zoomIn}
        onZoomOut={editor.zoomOut}
        onZoomFit={() => editor.setZoom(0.38)}
        onToggleRulers={() => editor.setShowRulers(!editor.showRulers)}
        onToggleGuides={() => editor.setShowGuides(!editor.showGuides)}
        onToggleSafeMargin={() => editor.setShowSafeMargin(!editor.showSafeMargin)}
        onSave={() => void handleSave()}
        onOpenExport={() => setExportOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenAi={() => setAiOpen(true)}
      />

      {/* Contextual Toolbar (Canva dynamic tools above canvas) */}
      <ContextualToolbar
        design={editor.design}
        selectedLayers={editor.selectedLayers}
        onUpdateLayer={editor.updateLayer}
        onUpdateSelectedLayers={editor.updateSelectedLayers}
        onToggleBold={editor.toggleBold}
        onToggleItalic={editor.toggleItalic}
        onToggleUnderline={editor.toggleUnderline}
        onToggleStrike={editor.toggleStrike}
        onToggleUppercase={editor.toggleUppercase}
        onAlignSelected={editor.alignSelected}
        onBringForward={() => {
          if (editor.primarySelectedLayer) editor.bringForward(editor.primarySelectedLayer.id);
        }}
        onSendBackward={() => {
          if (editor.primarySelectedLayer) editor.sendBackward(editor.primarySelectedLayer.id);
        }}
        onBringToFront={() => {
          if (editor.primarySelectedLayer) editor.bringToFront(editor.primarySelectedLayer.id);
        }}
        onSendToBack={() => {
          if (editor.primarySelectedLayer) editor.sendToBack(editor.primarySelectedLayer.id);
        }}
        onDuplicate={() => editor.duplicateLayers(editor.selectedLayerIds)}
        onDelete={() => editor.removeLayers(editor.selectedLayerIds)}
        onSetBackground={editor.setBackground}
        onSetShade={editor.setShade}
        onSetDimensionsPreset={handleSetDimensionsPreset}
        onOpenAssetPicker={() => {
          setAssetInsertTarget('background');
          setAssetPickerOpen(true);
        }}
      />

      {/* Unsaved recovery & conflict alerts */}
      {recovery && (
        <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <RotateCcw className="h-4 w-4 text-primary" />
            <span>Unsaved local cover draft found from previous session (Version {recovery.version}).</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                editor.setDesign(recovery.data);
                setBaseVersion(recovery.version);
                setRecovery(null);
                toast.success('Recovered local draft!');
              }}
            >
              Recover Draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                forgetDraft();
                setRecovery(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {conflict && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This cover was updated elsewhere. Choose how to proceed:</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => void handleResolveConflict(true)}
            >
              Keep local draft & overwrite
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => setDiscardConflict(true)}
            >
              Load latest saved
            </Button>
          </div>
        </div>
      )}

      {/* Main 3-Column Studio Interface */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar (Rail + Drawer) */}
        <EditorSidebar
          activeTab={editor.activeTab}
          onSelectTab={editor.setActiveTab}
          bookId={bookId}
          currentDesign={editor.design}
          backgroundColor={editor.design.background}
          shade={editor.design.shade}
          hasArtwork={!!editor.design.artworkId}
          onApplyTemplate={handleSelectTemplate}
          onAddShape={(shape) => editor.addLayer({ type: 'shape', ...shape })}
          onAddIcon={(iconName) =>
            editor.addLayer({
              type: 'icon',
              iconName,
              name: `Icon (${iconName})`,
              color: '#ffffff',
              width: 0.1,
              height: 0.06,
            })
          }
          onAddText={(textLayer) => editor.addLayer({ type: 'text', ...textLayer })}
          onAddImageLayer={(url, name) =>
            editor.addLayer({
              type: 'image',
              url,
              name: name || 'Uploaded Image',
              width: 0.4,
              height: 0.25,
            })
          }
          onSetBackgroundArtwork={(url) => {
            // direct URL or asset insertion
          }}
          onOpenAssetLibrary={() => {
            setAssetInsertTarget('layer');
            setAssetPickerOpen(true);
          }}
          onSetBackground={editor.setBackground}
          onSetShade={editor.setShade}
          onRemoveArtwork={() => editor.setArtworkId(null)}
          onApplyCover={(newCover) => {
            setSaved(newCover);
            editor.setDesign(newCover.data);
            setBaseVersion(newCover.version);
            forgetDraft();
          }}
          onSetArtwork={editor.setArtworkId}
        />

        {/* Central Design Canvas */}
        <div className="flex-1 h-full overflow-hidden relative flex flex-col bg-slate-900/90 dark:bg-slate-950">
          <DesignCanvas
            design={editor.design}
            selectedLayerIds={editor.selectedLayerIds}
            zoom={editor.zoom}
            showRulers={editor.showRulers}
            showGuides={editor.showGuides}
            showSafeMargin={editor.showSafeMargin}
            snapToGrid={editor.snapToGrid}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onZoomIn={editor.zoomIn}
            onZoomOut={editor.zoomOut}
            onZoomFit={() => editor.setZoom(0.38)}
            onSelectLayer={editor.selectLayer}
            onDeselectAll={editor.deselectAll}
            onSelectAll={editor.selectAll}
            onUpdateLayer={editor.updateLayer}
            onRemoveLayers={editor.removeLayers}
            onDuplicateLayers={editor.duplicateLayers}
            onToggleLock={editor.toggleLock}
            onBringForward={editor.bringForward}
            onSendBackward={editor.sendBackward}
            onBringToFront={editor.bringToFront}
            onSendToBack={editor.sendToBack}
            onUndo={editor.undo}
            onRedo={editor.redo}
          />
        </div>

        {/* Right Properties & Layers Panel */}
        <EditorPropertiesPanel
          layers={editor.design.layers || []}
          selectedLayerIds={editor.selectedLayerIds}
          primarySelectedLayer={editor.primarySelectedLayer}
          backgroundColor={editor.design.background}
          shade={editor.design.shade}
          onSelectLayer={editor.selectLayer}
          onUpdateLayer={editor.updateLayer}
          onToggleLock={editor.toggleLock}
          onToggleHide={editor.toggleHide}
          onBringForward={editor.bringForward}
          onSendBackward={editor.sendBackward}
          onDuplicate={(id) => editor.duplicateLayers([id])}
          onDelete={(id) => editor.removeLayers([id])}
        />
      </div>

      {/* Export Modal */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        bookId={bookId}
        savedVersion={saved.version}
      />

      {/* AI Cover Designer Modal */}
      <AiCoverDesignerModal
        bookId={bookId}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onApplyCover={(newCover) => {
          setSaved(newCover);
          editor.setDesign(newCover.data);
          setBaseVersion(newCover.version);
          forgetDraft();
          toast.success(`AI cover applied as Version ${newCover.version}!`);
          setAiOpen(false);
          void qc.invalidateQueries({ queryKey: ['cover', ownerId, bookId] });
          void qc.invalidateQueries({ queryKey: ['books'] });
        }}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        bookId={bookId}
        open={historyOpen}
        currentVersion={saved.version}
        onClose={() => setHistoryOpen(false)}
        onRestoreCover={(restored) => {
          setSaved(restored);
          editor.setDesign(restored.data);
          setBaseVersion(restored.version);
          forgetDraft();
          toast.success(`Restored to Version ${restored.version}!`);
          setHistoryOpen(false);
          void qc.invalidateQueries({ queryKey: ['cover', ownerId, bookId] });
          void qc.invalidateQueries({ queryKey: ['books'] });
        }}
      />

      {/* Asset Library Dialog */}
      <Dialog
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        title={assetInsertTarget === 'background' ? 'Choose Cover Artwork' : 'Insert Image Layer'}
        className="max-w-4xl"
      >
        <AssetLibrary
          key={ownerId}
          onInsert={(asset) => handleAssetSelect(asset)}
        />
      </Dialog>

      {/* Template Apply Confirmation */}
      <Dialog
        open={!!templatePending}
        onClose={() => setTemplatePending(null)}
        title="Apply Cover Template"
        description={`Do you want to apply "${templatePending?.title}"?`}
        className="max-w-md"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Choose whether to automatically fill the template with your book’s real title and author name:
          </p>

          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1 text-xs">
            <p className="font-semibold text-foreground">
              Book Title: <span className="font-normal text-muted-foreground">{bookTitle || '(Untitled)'}</span>
            </p>
            <p className="font-semibold text-foreground">
              Author: <span className="font-normal text-muted-foreground">{bookAuthor || '(Anonymous)'}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => handleConfirmTemplate(true)}
              className="w-full justify-center"
            >
              Apply with My Book Title & Author
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleConfirmTemplate(false)}
              className="w-full justify-center"
            >
              Apply with Template Defaults
            </Button>
            <Button
              variant="ghost"
              onClick={() => setTemplatePending(null)}
              className="w-full justify-center text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Discard Conflict Confirm */}
      <ConfirmDialog
        open={discardConflict}
        onClose={() => setDiscardConflict(false)}
        onConfirm={() => {
          setDiscardConflict(false);
          void handleResolveConflict(false);
        }}
        title="Discard local draft?"
        description="The latest saved cover on the server will be loaded."
        confirmLabel="Discard & Load Saved"
      />
    </div>
  );
}

function AiCoverDesignerModal({
  bookId,
  open,
  onClose,
  onApplyCover,
}: {
  bookId: string;
  open: boolean;
  onClose: () => void;
  onApplyCover: (cover: SavedCover) => void;
}) {
  const [style, setStyle] = useState('modern');
  const [userPrompt, setUserPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [variations, setVariations] = useState<{ id: string; styleName: string; plan: { visualConcept?: string; [key: string]: unknown } }[] | null>(null);

  const handleGenerate = async (selectedStyle = style) => {
    setBusy(true);
    try {
      const res = await operationRequest<{ cover: SavedCover }>(`/books/${bookId}/cover/ai-generate`, {
        style: selectedStyle,
        userPrompt: userPrompt.trim() || undefined,
      });
      toast.success('AI cover generated successfully!');
      onApplyCover(res.cover);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExploreVariations = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ variations: { id: string; styleName: string; plan: { visualConcept?: string; [key: string]: unknown } }[] }>(`/books/${bookId}/cover/ai-variations`, {
        style,
        userPrompt: userPrompt.trim() || undefined,
      });
      setVariations(res.variations);
      toast.success('Generated 3 style concepts for review.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="AI Book Cover Designer"
      description="Generate an intelligent commercial book cover using OpenAI."
      className="max-w-xl"
    >
      <div className="space-y-5">
        <Field label="Design Direction / Genre" htmlFor="ai-modal-style">
          <Select id="ai-modal-style" value={style} onChange={(e) => setStyle(e.target.value)} disabled={busy}>
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Visual Prompt / Custom Instructions (Optional)"
          htmlFor="ai-modal-prompt"
          hint="Specific visual motifs, color schemes, or moods to guide OpenAI."
        >
          <Textarea
            id="ai-modal-prompt"
            className="min-h-20"
            placeholder="e.g. Cinematic golden hour lighting, dramatic sea horizon, minimalist typography"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            maxLength={1000}
            disabled={busy}
          />
        </Field>

        {variations && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Explore Style Concepts
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              {variations.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3 text-xs"
                >
                  <div className="space-y-1">
                    <span className="font-bold capitalize text-primary">{v.styleName}</span>
                    <p className="line-clamp-3 text-[11px] text-muted-foreground">{v.plan.visualConcept}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 text-xs"
                    disabled={busy}
                    onClick={() => {
                      setStyle(v.styleName);
                      void handleGenerate(v.styleName);
                    }}
                  >
                    Generate This
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" disabled={busy} onClick={handleExploreVariations}>
            {busy && !variations ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Preview 3 Variations
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void handleGenerate()}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate & Apply Cover
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function VersionHistoryModal({
  bookId,
  open,
  currentVersion,
  onClose,
  onRestoreCover,
}: {
  bookId: string;
  open: boolean;
  currentVersion: number;
  onClose: () => void;
  onRestoreCover: (cover: SavedCover) => void;
}) {
  const versionsQuery = useQuery({
    queryKey: ['cover-versions', bookId],
    queryFn: () => api.get<{ versions: CoverVersionMeta[] }>(`/books/${bookId}/cover/versions`),
    enabled: open,
  });
  const [busy, setBusy] = useState(false);

  const handleRestore = async (version: number) => {
    setBusy(true);
    try {
      const res = await api.post<{ cover: SavedCover }>(`/books/${bookId}/cover/restore`, { version });
      toast.success(`Restored to cover version ${version}.`);
      onRestoreCover(res.cover);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cover Version History"
      description="Every saved cover change creates an immutable version."
      className="max-w-md"
    >
      <div className="space-y-4">
        {versionsQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading version history…</p>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No previous cover versions found.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-surface overflow-hidden max-h-96 overflow-y-auto">
            {versions.map((v) => {
              const isCurrent = v.version === currentVersion;
              return (
                <div key={v.id} className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-7 rounded overflow-hidden border border-border shadow-xs shrink-0"
                      style={{ background: v.background || '#1e293b' }}
                    >
                      {v.artworkId && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={imageUrl(v.artworkId)} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">Version {v.version}</span>
                        {isCurrent && (
                          <span className="rounded bg-primary-soft px-1.5 py-0.2 text-[10px] font-bold text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 opacity-60" />
                        {timeAgo(v.createdAt)}
                      </p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleRestore(v.version)}>
                      Restore
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
