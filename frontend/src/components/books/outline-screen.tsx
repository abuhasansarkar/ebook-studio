"use client";

import { OutlineHistory } from "./outline-history";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Copy, GripVertical, Lock, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { CREDIT_COSTS, chapterCredits, getLanguage, outlineSchema, type Outline } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, ErrorState, PageLoader, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useBookAction } from "@/lib/queries";

interface EditableChapter {
  key: string;
  title: string;
  goal: string;
  keyPoints: string; // one per line in the UI
  targetWords: number;
}

let keySeq = 0;
const newKey = () => `ch-${++keySeq}`;

function toEditable(o: Outline) {
  return {
    title: o.title,
    subtitle: o.subtitle,
    chapters: o.chapters.map((c) => ({ key: newKey(), title: c.title, goal: c.goal, keyPoints: c.keyPoints.join("\n"), targetWords: c.targetWords })),
  };
}

function toOutline(e: { title: string; subtitle: string; chapters: EditableChapter[] }): Outline {
  return {
    title: e.title.trim(),
    subtitle: e.subtitle.trim(),
    chapters: e.chapters.map((c) => ({
      title: c.title.trim(),
      goal: c.goal.trim(),
      keyPoints: c.keyPoints.split("\n").map((k) => k.trim()).filter(Boolean).slice(0, 12),
      targetWords: c.targetWords,
    })),
  };
}

function SortableChapter({ ch, index, dir, onChange, onRemove, onDuplicate, canRemove }: { ch: EditableChapter; index: number; dir: string; onChange: (c: EditableChapter) => void; onRemove: () => void; onDuplicate: () => void; canRemove: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-80" : ""}>
      <Card className="flex gap-3 p-4">
        <div className="flex flex-col items-center gap-2 pt-1">
          <button type="button" className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" aria-label={`Reorder chapter ${index + 1}`} {...attributes} {...listeners}>
            <GripVertical className="h-4.5 w-4.5" />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-hover">{index + 1}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-3" dir={dir}>
          <Input aria-label={`Chapter ${index + 1} title`} value={ch.title} onChange={(e) => onChange({ ...ch, title: e.target.value })} className="font-semibold" />
          <Textarea aria-label={`Chapter ${index + 1} goal`} rows={2} value={ch.goal} placeholder="What will the reader get from this chapter?" onChange={(e) => onChange({ ...ch, goal: e.target.value })} className="min-h-0 text-sm" />
          <div>
            <Label className="text-xs text-muted-foreground">Sections (one per line)</Label>
            <Textarea aria-label={`Chapter ${index + 1} sections`} rows={3} value={ch.keyPoints} onChange={(e) => onChange({ ...ch, keyPoints: e.target.value })} className="min-h-0 text-sm" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2" dir="ltr">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Target words
              <Select value={ch.targetWords} onChange={(e) => onChange({ ...ch, targetWords: Number(e.target.value) })} className="h-8 w-auto py-0 text-xs">
                {[500, 800, 1000, 1500, 2000, 2500, 3000, 4000].map((w) => (
                  <option key={w} value={w}>{w.toLocaleString()}</option>
                ))}
                {![500, 800, 1000, 1500, 2000, 2500, 3000, 4000].includes(ch.targetWords) && <option value={ch.targetWords}>{ch.targetWords}</option>}
              </Select>
            </label>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={onDuplicate} aria-label={`Duplicate chapter ${index + 1}`}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove} aria-label={`Delete chapter ${index + 1}`} className="text-danger hover:bg-danger-soft">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}

export function OutlineScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const router = useRouter();
  const { data: book, isLoading, error, refetch } = useBook(bookId);
  const actions = useBookAction(bookId);
  const [draft, setDraft] = useState<{ title: string; subtitle: string; chapters: EditableChapter[] } | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Load the server outline into the local editor whenever a new version arrives
  // (unless the user has unsaved edits). Adjusting state during render is React's
  // recommended pattern for state derived from changing props/data.
  const serverOutline = book?.outline;
  if (serverOutline && serverOutline.version !== loadedVersion && !(dirty && loadedVersion !== null)) {
    setDraft(toEditable(serverOutline.data));
    setLoadedVersion(serverOutline.version);
    setDirty(false);
  }

  const written = book?.chapters.some((c) => c.status === "done" || c.version > 0 || c.wordCount > 0) ?? false;
  const locked = written || book?.activeJob?.type === "chapters";
  const outlineJobRunning = book?.activeJob?.type === "outline";
  const lang = getLanguage(book?.language ?? "en");
  const writeCost = useMemo(() => draft?.chapters.reduce((s, c) => s + chapterCredits(c.targetWords), 0) ?? 0, [draft]);

  if (isLoading) return <PageLoader />;
  if (error || !book) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /></div>;

  const update = (fn: (d: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };

  const validate = (): Outline | null => {
    if (!draft) return null;
    const parsed = outlineSchema.safeParse(toOutline(draft));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ? `Check your outline: ${parsed.error.issues[0].message}` : "Every chapter needs a title.");
      return null;
    }
    if (draft.chapters.some((c) => !c.title.trim())) {
      toast.error("Every chapter needs a title.");
      return null;
    }
    return parsed.data;
  };

  const save = async () => {
    const o = validate();
    if (!o) return null;
    try {
      const saved = await actions.saveOutline.mutateAsync({ ...o, baseVersion: loadedVersion ?? 0 });
      setDirty(false);
      setLoadedVersion(null); // accept the new server version
      toast.success("Outline saved");
      return saved.outline.version;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    }
  };

  const approve = async () => {
    const version = dirty ? await save() : loadedVersion;
    if (!version) return;
    try {
      await actions.approveOutline.mutateAsync(version);
      toast.success("Outline approved");
      router.push(`/app/books/${bookId}/generate`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const regenerate = async () => {
    setConfirmRegen(false);
    try {
      await actions.generateOutline.mutateAsync();
      setDirty(false);
      setLoadedVersion(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // ----- States -----
  if (outlineJobRunning) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
          <Spinner className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Planning your book…</h2>
        <p className="mt-2 text-muted-foreground">Designing chapters, goals and sections. This usually takes under a minute.</p>
      </div>
    );
  }

  if (!draft) {
    const failed = book.lastJob?.type === "outline" && book.lastJob.status === "failed";
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <Card className="p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">{failed ? "The outline couldn't be generated" : "No outline yet"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{failed ? book.lastJob?.error ?? "Something went wrong." : "Generate a chapter plan from your brief."} Your credits were not charged for failed attempts.</p>
          <Button className="mt-6" loading={actions.generateOutline.isPending} onClick={() => void regenerate()}>
            <Sparkles className="h-4 w-4" /> Generate outline ({CREDIT_COSTS.outline} credits)
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {book.outline && <div className="mb-4 flex items-center gap-3"><OutlineHistory bookId={bookId} currentVersion={book.outline.version} disabled={dirty || !!book.activeJob} onRestored={() => { setDirty(false); setLoadedVersion(null); }} /><span className="text-xs text-muted-foreground">Version {book.outline.version}{dirty ? ' · Save edits before opening history' : ''}</span></div>}
      {locked && (
        <Alert tone="info" className="mb-6 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" /> Chapters have already been written from this outline, so it&apos;s locked. Edit the text in the editor instead.
        </Alert>
      )}
      {book.outline?.approvedAt && !locked && !dirty && (
        <Alert tone="success" className="mb-6 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> This outline is approved. You can still change it before writing starts.
        </Alert>
      )}

      <fieldset disabled={locked} className="space-y-6">
        <Card className="space-y-4 p-6" dir={lang.dir}>
          <div>
            <Label htmlFor="book-title">Book title</Label>
            <Input id="book-title" value={draft.title} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} className="text-lg font-bold" />
          </div>
          <div>
            <Label htmlFor="book-subtitle">Subtitle</Label>
            <Input id="book-subtitle" value={draft.subtitle} onChange={(e) => update((d) => ({ ...d, subtitle: e.target.value }))} />
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {draft.chapters.length} chapters <span className="text-sm font-normal text-muted-foreground">· drag to reorder</span>
          </h2>
          {!locked && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)} loading={actions.generateOutline.isPending}>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e: DragEndEvent) => {
            if (!e.over || e.active.id === e.over.id) return;
            update((d) => {
              const from = d.chapters.findIndex((c) => c.key === e.active.id);
              const to = d.chapters.findIndex((c) => c.key === e.over!.id);
              return { ...d, chapters: arrayMove(d.chapters, from, to) };
            });
          }}
        >
          <SortableContext items={draft.chapters.map((c) => c.key)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {draft.chapters.map((ch, i) => (
                <SortableChapter
                  key={ch.key}
                  ch={ch}
                  index={i}
                  dir={lang.dir}
                  canRemove={draft.chapters.length > 1}
                  onChange={(c) => update((d) => ({ ...d, chapters: d.chapters.map((x) => (x.key === c.key ? c : x)) }))}
                  onRemove={() => update((d) => ({ ...d, chapters: d.chapters.filter((x) => x.key !== ch.key) }))}
                  onDuplicate={() => update((d) => ({ ...d, chapters: [...d.chapters.slice(0, i + 1), { ...ch, key: newKey(), title: `${ch.title} (copy)` }, ...d.chapters.slice(i + 1)] }))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {!locked && (
          <Button
            variant="secondary"
            className="w-full border-dashed"
            disabled={draft.chapters.length >= 30}
            onClick={() => update((d) => ({ ...d, chapters: [...d.chapters, { key: newKey(), title: "New chapter", goal: "", keyPoints: "", targetWords: d.chapters.at(-1)?.targetWords ?? 1500 }] }))}
          >
            <Plus className="h-4 w-4" /> Add chapter
          </Button>
        )}
      </fieldset>

      {!locked && (
        <div className="sticky bottom-4 mt-8">
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Writing this book will use about <strong className="text-foreground">{writeCost} credits</strong>.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void save()} disabled={!dirty} loading={actions.saveOutline.isPending}>
                Save changes
              </Button>
              <Button onClick={() => void approve()} loading={actions.approveOutline.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Approve outline
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Dialog open={confirmRegen} onClose={() => setConfirmRegen(false)} title="Regenerate the outline?" description={`A fresh outline is created from your brief (${CREDIT_COSTS.outline} credits). Your current version stays in history.`}>
        {dirty && <Alert tone="warning" className="mb-4">You have unsaved edits that will be replaced.</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          <Button onClick={() => void regenerate()}>
            <RefreshCw className="h-4 w-4" /> Regenerate
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
