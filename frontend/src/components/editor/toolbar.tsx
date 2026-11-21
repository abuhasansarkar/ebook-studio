"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useMemo, useState } from "react";
import {
  Bold, Columns3, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Replace, Rows3, Table, Trash2, Underline, Undo2, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { findMatches } from "./find-replace";

function ToolButton({ icon: Icon, label, active, disabled, onClick }: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      className={cn("flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40", active && "bg-primary-soft text-primary-hover")}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden />;

export function EditorToolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      inTable: e.isActive("table"),
      link: e.isActive("link"),
      editable: e.isEditable,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
      <ToolButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()} />
      <ToolButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      <Sep />
      <ToolButton icon={Heading2} label="Heading" active={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="Subheading" active={s.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <Sep />
      <ToolButton icon={Bold} label="Bold (Ctrl+B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic (Ctrl+I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Underline (Ctrl+U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <Sep />
      <ToolButton icon={List} label="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolButton icon={Quote} label="Quote" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolButton icon={Minus} label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <ToolButton
        icon={Table}
        label={s.inTable ? "Delete table" : "Insert table"}
        active={s.inTable}
        onClick={() => (s.inTable ? editor.chain().focus().deleteTable().run() : editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      />
      {s.inTable && (
        <>
          <ToolButton icon={Rows3} label="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolButton icon={Columns3} label="Add column to the right" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolButton icon={Trash2} label="Delete this row" onClick={() => editor.chain().focus().deleteRow().run()} />
        </>
      )}
      <ToolButton icon={Link2} label={s.link ? "Edit link" : "Add link"} active={s.link} disabled={!s.editable} onClick={() => setLinkOpen(true)} />
      <Sep />
      <ToolButton icon={Replace} label="Find and replace" onClick={() => setFindOpen(true)} />
      {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      {findOpen && <FindReplaceDialog editor={editor} onClose={() => setFindOpen(false)} />}
    </div>
  );
}

/** Adds, changes or removes a link on the selected text. */
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState("");
  const hasSelection = !editor.state.selection.empty || Boolean(current);

  const apply = () => {
    const value = href.trim();
    // Only web and email links: a book file must not carry script or file links.
    const normalized = /^(https?:\/\/|mailto:)/i.test(value) ? value : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value) ? `https://${value}` : null;
    if (!normalized || /\s/.test(normalized)) return setError("Enter a web address (https://…) or an email link (mailto:…) without spaces.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={current ? "Edit link" : "Add link"} description={hasSelection ? undefined : "Select the words to link first, then add the link."}>
      <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="space-y-4">
        <Field label="Link address" htmlFor="link-href" error={error}>
          <Input id="link-href" autoFocus value={href} placeholder="https://example.com" onChange={(e) => { setHref(e.target.value); setError(""); }} disabled={!hasSelection} />
        </Field>
        <div className="flex justify-end gap-2">
          {current && (
            <Button type="button" variant="ghost" className="me-auto text-danger" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>
              Remove link
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!hasSelection || !href.trim()}>Save link</Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Finds text in the open chapter and replaces it.
 *
 * Replacements are ordinary edits: they autosave with history, and "Replace
 * all" is one transaction, so a single Undo reverses it.
 */
function FindReplaceDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  // Recounted after each replacement (revision) as well as on typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matches = useMemo(() => findMatches(editor.state.doc, query, caseSensitive), [editor, query, caseSensitive, revision]);
  const editable = editor.isEditable;

  const selectNext = () => {
    if (!matches.length) return;
    const after = editor.state.selection.to;
    const next = matches.find((m) => m.from >= after) ?? matches[0];
    editor.chain().setTextSelection(next).scrollIntoView().run();
    setNotice(`Match ${matches.indexOf(next) + 1} of ${matches.length} selected.`);
  };

  const replaceCurrent = () => {
    const { from, to } = editor.state.selection;
    const selected = matches.find((m) => m.from === from && m.to === to);
    if (!selected) return selectNext();
    editor.view.dispatch(editor.state.tr.insertText(replacement, selected.from, selected.to));
    setRevision((r) => r + 1);
    setNotice("Replaced 1 match.");
    queueMicrotask(selectNext);
  };

  const replaceAll = () => {
    if (!matches.length) return;
    const tr = editor.state.tr;
    // From the end, so earlier positions stay valid while later text changes.
    for (const m of [...matches].reverse()) tr.insertText(replacement, m.from, m.to);
    editor.view.dispatch(tr);
    setRevision((r) => r + 1);
    setNotice(`Replaced ${matches.length} match${matches.length === 1 ? "" : "es"}. Use Undo to reverse it.`);
  };

  return (
    <Dialog open onClose={onClose} title="Find and replace" description="Searches the open chapter. Replacements save like any other edit.">
      <form onSubmit={(e) => { e.preventDefault(); selectNext(); }} className="space-y-4">
        <Field label="Find" htmlFor="find-query" hint={query ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : undefined}>
          <Input id="find-query" autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setNotice(""); }} />
        </Field>
        <Field label="Replace with" htmlFor="find-replacement">
          <Input id="find-replacement" value={replacement} onChange={(e) => setReplacement(e.target.value)} disabled={!editable} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Match case
        </label>
        {!editable && <p className="text-sm text-muted-foreground">This chapter can&apos;t be edited right now, so replacing is off.</p>}
        <p role="status" className="min-h-5 text-sm text-muted-foreground">{notice}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" variant="secondary" disabled={!matches.length}>Find next</Button>
          <Button type="button" variant="secondary" disabled={!matches.length || !editable} onClick={replaceCurrent}>Replace</Button>
          <Button type="button" disabled={!matches.length || !editable} onClick={replaceAll}>Replace all</Button>
        </div>
      </form>
    </Dialog>
  );
}
