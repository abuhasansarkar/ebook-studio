"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Minus, Quote, Redo2, Table, Underline, Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

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
    </div>
  );
}
