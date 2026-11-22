"use client";

import { AssetLibrary } from '@/components/assets/asset-library';
import { PrivateImage } from './private-image';
import { FindingHighlight } from './finding-highlight';
import { FindingFocus } from './finding-focus';
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { getLanguage } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { qk } from "@/lib/queries";
import type { ChapterFull, ChapterMeta } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { AiAssist } from "./ai-assist";
import { VersionHistory } from "./version-history";
import { EditorToolbar } from "./toolbar";
import { useAutosave, type ChapterPatch, type SavedChapter } from "./use-autosave";
import { SaveIndicator } from "./save-indicator";

export function ChapterEditor({ ownerId, chapter, bookId, language, findingId }: { ownerId: string; chapter: ChapterFull; bookId: string; language: string; findingId?: string | null }) {
  const qc = useQueryClient();
  const lang = getLanguage(language);
  const [title, setTitle] = useState(chapter.title);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [discardDraftsOpen, setDiscardDraftsOpen] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<{ title?: string; contentJson?: Record<string, unknown> } | null>(null);

  const onSaved = useCallback(
    (saved: SavedChapter, payload: ChapterPatch) => {
      // Keep caches in sync without refetching the document we own, so reopening
      // this chapter later starts from the latest saved content and version.
      qc.setQueryData<ChapterFull>(qk.chapter(saved.id), (c) =>
        c ? { ...c, title: saved.title, version: saved.version, wordCount: saved.wordCount, status: saved.status as ChapterFull["status"], updatedAt: saved.updatedAt, ...(payload.contentJson ? { contentJson: payload.contentJson } : {}) } : c,
      );
      qc.setQueryData<ChapterMeta[]>(qk.chapters(bookId), (list) => list?.map((c) => (c.id === saved.id ? { ...c, title: saved.title, wordCount: saved.wordCount, version: saved.version, status: saved.status as ChapterMeta["status"], updatedAt: saved.updatedAt } : c)));
      void qc.invalidateQueries({ queryKey: qk.book(bookId) });
    },
    [qc, bookId],
  );
  const save = useAutosave(ownerId, chapter.id, chapter.version, chapter.updatedAt, onSaved);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true } }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "Start writing this chapter…" }),
      CharacterCount,
      PrivateImage,
      FindingHighlight,
    ],
    content: chapter.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "book-prose", lang: lang.code, dir: lang.dir, "aria-label": "Chapter content", spellcheck: "true" },
    },
    onUpdate: ({ editor: e }) => save.schedule({ contentJson: e.getJSON() as Record<string, unknown> }),
  });

  useEffect(() => {
    editor?.setEditable(!historyOpen && save.ready && save.drafts.length === 0 && !!ownerId, false);
  }, [editor, historyOpen, save.ready, save.drafts.length, ownerId]);

  const words = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.storage.characterCount.words() : 0) });

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save.retry();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:top-0 sm:px-6">
        {editor ? <EditorToolbar editor={editor} /> : <span />}
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" disabled={!editor || !save.ready || save.drafts.length > 0 || historyOpen} onClick={() => setImagesOpen(true)}>Images</Button>
          <Button variant="secondary" size="sm" disabled={!save.ready || save.drafts.length > 0 || save.state === 'saved' || save.state === 'saving' || save.state === 'conflict'} onClick={() => void save.retry()}><Save className="h-4 w-4" /> Save</Button>
          <Button variant="secondary" size="sm" disabled={!editor} onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ title, contentJson: editor?.getJSON() }, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'chapter-backup.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}><Download className="h-4 w-4" /> Backup</Button>
          <Button variant="secondary" size="sm" disabled={!editor || !save.ready || save.drafts.length > 0 || historyOpen} onClick={() => restoreFileRef.current?.click()} title="Restore chapter from a JSON backup file"><Upload className="h-4 w-4" /> Restore</Button>
          <input
            type="file"
            ref={restoreFileRef}
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text) as { title?: string; contentJson?: Record<string, unknown> };
                if (!data.contentJson && !data.title) throw new Error("Invalid backup format");
                setRestoreConfirm(data);
              } catch {
                toast.error("Could not parse chapter backup file. Ensure it is a valid JSON backup.");
              } finally {
                e.target.value = "";
              }
            }}
          />
          <Button variant="secondary" size="sm" disabled={!save.ready || save.drafts.length > 0 || save.state !== "saved" || !editor} onClick={() => setHistoryOpen(true)} title={save.state !== "saved" ? "Save your changes before opening history" : "View earlier drafts"}><History className="h-4 w-4" /> History</Button>
          <span className="text-xs text-muted-foreground">{formatNumber(words ?? 0)} words</span>
          <SaveIndicator state={save.state} lastSavedAt={save.lastSavedAt} error={save.errorMsg} onRetry={() => void save.retry()} />
        </div>
      </div>

      {findingId && <FindingFocus editor={editor} findingId={findingId} bookId={bookId} editable={save.ready && save.drafts.length === 0 && !historyOpen} />}
      {save.storageError && <Alert tone="danger" className="m-4">{save.storageError}</Alert>}
      {save.drafts.length > 0 && <Alert tone="info" className="m-4">
        <p className="font-semibold">Unsaved browser drafts found</p>
        <p>Review a recovered draft before saving. If the server changed, you will be asked which version to keep. Other tabs’ newer edits are preserved.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {save.drafts.map(draft => <Button key={draft.id} variant="secondary" size="sm" onClick={() => {
            const patch = save.recover(draft);
            if (patch.title !== undefined) setTitle(patch.title);
            if (patch.contentJson) editor?.commands.setContent(patch.contentJson, { emitUpdate: false });
          }}>Recover {new Date(draft.updatedAt).toLocaleString()} (v{draft.baseVersion})</Button>)}
          <Button variant="secondary" size="sm" onClick={() => setDiscardDraftsOpen(true)}>Discard browser drafts</Button>
        </div>
      </Alert>}
      <ConfirmDialog
        open={discardDraftsOpen}
        onClose={() => setDiscardDraftsOpen(false)}
        onConfirm={() => {
          setDiscardDraftsOpen(false);
          void save.discardDrafts();
        }}
        title="Discard these browser drafts?"
        description="The version saved on the server will be kept."
        confirmLabel="Discard drafts"
      >
        <p>Unsaved changes kept only in this browser will be lost. This cannot be undone.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={restoreConfirm !== null}
        onClose={() => setRestoreConfirm(null)}
        onConfirm={() => {
          if (!restoreConfirm || !editor) return;
          if (restoreConfirm.title) setTitle(restoreConfirm.title);
          if (restoreConfirm.contentJson) {
            editor.commands.setContent(restoreConfirm.contentJson, { emitUpdate: true });
            save.schedule({ title: restoreConfirm.title ?? title, contentJson: restoreConfirm.contentJson });
          }
          toast.success("Chapter restored from backup");
          setRestoreConfirm(null);
        }}
        title="Restore chapter from backup?"
        description="This will replace the current chapter title and content in the editor with the contents of the backup file."
        confirmLabel="Restore"
      >
        <p>Current unsaved changes will be replaced. You can review revision history if you need to access earlier server drafts.</p>
      </ConfirmDialog>
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-10" style={{ fontFamily: lang.fontFamily }}>
        <p className="mb-2 text-sm font-bold text-primary">Chapter {chapter.position + 1}</p>
        <input
          disabled={historyOpen || !save.ready || save.drafts.length > 0}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save.schedule({ title: e.target.value.trim() });
          }}
          dir={lang.dir}
          lang={lang.code}
          aria-label="Chapter title"
          className="mb-8 w-full border-0 bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground"
          placeholder="Chapter title"
          style={{ fontFamily: lang.fontFamily }}
        />
        <EditorContent editor={editor} />
        {editor && !historyOpen && save.ready && save.drafts.length === 0 && <AiAssist editor={editor} bookId={bookId} dir={lang.dir} />}
      </div>

      <Dialog open={imagesOpen} onClose={() => setImagesOpen(false)} title="Insert a private image" className="max-w-4xl">
        <AssetLibrary key={ownerId} onInsert={asset => {
          if (!editor?.isEditable) return;
          editor.chain().focus().insertContent({ type: 'image', attrs: { assetId: asset.id, alt: asset.alt, caption: asset.caption } }).run();
          setImagesOpen(false);
        }} />
      </Dialog>
      {historyOpen && <VersionHistory chapterId={chapter.id} currentVersion={chapter.version} onClose={() => setHistoryOpen(false)} onRestored={(saved, revision) => {
        const contentJson = revision.contentJson ?? { type: "doc", content: [] };
        editor?.commands.setContent(contentJson, { emitUpdate: false });
        setTitle(revision.title);
        save.adoptRestored(saved);
        onSaved(saved, { title: revision.title, contentJson });
        void qc.invalidateQueries({ queryKey: ["chapter-versions", chapter.id] });
        setHistoryOpen(false);
      }} />}

      <Dialog open={save.conflict !== null} onClose={() => undefined} title="This chapter was changed elsewhere" description="It was edited in another tab or on another device after you opened it. Choose which version to keep.">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              const theirs = save.resolveTakeTheirs();
              if (theirs && editor) {
                editor.commands.setContent(theirs.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
                setTitle(theirs.title);
                void qc.invalidateQueries({ queryKey: qk.chapter(chapter.id) });
                void qc.invalidateQueries({ queryKey: qk.chapters(bookId) });
              }
            }}
          >
            Load the other version
          </Button>
          <Button onClick={() => editor && save.resolveKeepMine({ title: title.trim() || chapter.title, contentJson: editor.getJSON() as Record<string, unknown> })}>Keep my version</Button>
        </div>
      </Dialog>
    </div>
  );
}
