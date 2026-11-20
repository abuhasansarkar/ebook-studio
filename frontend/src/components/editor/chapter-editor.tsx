"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CloudOff, History, Loader2 } from "lucide-react";
import { getLanguage } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { qk } from "@/lib/queries";
import type { ChapterFull, ChapterMeta } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";
import { AiAssist } from "./ai-assist";
import { VersionHistory } from "./version-history";
import { EditorToolbar } from "./toolbar";
import { useAutosave, type ChapterPatch, type SavedChapter, type SaveState } from "./use-autosave";

function SaveIndicator({ state, lastSavedAt, error, onRetry }: { state: SaveState; lastSavedAt: Date; error: string | null; onRetry: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (state === "saving") return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>;
  if (state === "dirty") return <span className="text-xs text-muted-foreground">Unsaved changes</span>;
  if (state === "conflict") return <span className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Edit conflict</span>;
  if (state === "error")
    return (
      <span className="flex items-center gap-1.5 text-xs text-danger" title={error ?? undefined}>
        <CloudOff className="h-3.5 w-3.5" /> Not saved
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">Retry</button>
      </span>
    );
  return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-success" /> Saved {timeAgo(lastSavedAt)}</span>;
}

export function ChapterEditor({ chapter, bookId, language }: { chapter: ChapterFull; bookId: string; language: string }) {
  const qc = useQueryClient();
  const lang = getLanguage(language);
  const [title, setTitle] = useState(chapter.title);
  const [historyOpen, setHistoryOpen] = useState(false);

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
  const save = useAutosave(chapter.id, chapter.version, chapter.updatedAt, onSaved);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true } }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "Start writing this chapter…" }),
      CharacterCount,
    ],
    content: chapter.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "book-prose", lang: lang.code, dir: lang.dir, "aria-label": "Chapter content", spellcheck: "true" },
    },
    onUpdate: ({ editor: e }) => save.schedule({ contentJson: e.getJSON() as Record<string, unknown> }),
  });

  useEffect(() => {
    editor?.setEditable(!historyOpen, false);
  }, [editor, historyOpen]);

  const words = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.storage.characterCount.words() : 0) });

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save.flush();
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
          <Button variant="secondary" size="sm" disabled={save.state !== "saved" || !editor} onClick={() => setHistoryOpen(true)} title={save.state !== "saved" ? "Save your changes before opening history" : "View earlier drafts"}><History className="h-4 w-4" /> History</Button>
          <span className="text-xs text-muted-foreground">{formatNumber(words ?? 0)} words</span>
          <SaveIndicator state={save.state} lastSavedAt={save.lastSavedAt} error={save.errorMsg} onRetry={() => void save.flush()} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-10" style={{ fontFamily: lang.fontFamily }}>
        <p className="mb-2 text-sm font-bold text-primary">Chapter {chapter.position + 1}</p>
        <input
          disabled={historyOpen}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) save.schedule({ title: e.target.value.trim() });
          }}
          dir={lang.dir}
          lang={lang.code}
          aria-label="Chapter title"
          className="mb-8 w-full border-0 bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground"
          placeholder="Chapter title"
          style={{ fontFamily: lang.fontFamily }}
        />
        <EditorContent editor={editor} />
        {editor && !historyOpen && <AiAssist editor={editor} bookId={bookId} dir={lang.dir} />}
      </div>

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
