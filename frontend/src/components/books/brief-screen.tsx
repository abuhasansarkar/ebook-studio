"use client";

import Link from "next/link";
import { use, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRight, Lock, RotateCcw, Save } from "lucide-react";
import { DEPTHS, KNOWLEDGE_LEVELS, LANGUAGES, TONES, bookBriefSchema, type BookBrief, type BookBriefInput } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook, useUpdateBrief } from "@/lib/queries";
import { BookTypePicker, enumLabel } from "./book-type-picker";

const WORD_PRESETS = [
  { value: 800, label: "Short (~800)" },
  { value: 1500, label: "Standard (~1,500)" },
  { value: 2500, label: "Long (~2,500)" },
  { value: 4000, label: "In depth (~4,000)" },
];

const STYLE_FIELDS = [
  ["purpose", "Book purpose", 300, "e.g. Build trust with new coaching clients"],
  ["readerAge", "Reader age range", 100, "e.g. 25–40"],
  ["writingStyle", "Writing style", 300, "e.g. Short paragraphs, practical examples"],
  ["pointOfView", "Point of view", 100, "e.g. Second person (“you”)"],
  ["brandName", "Author brand", 120, "e.g. Calm Kitchen"],
] as const;

/** Fills the optional text fields so the form never switches between controlled and uncontrolled. */
function toFormValues(brief: BookBrief): BookBriefInput {
  return {
    ...brief,
    title: brief.title ?? "",
    readerProblem: brief.readerProblem ?? "",
    readerOutcome: brief.readerOutcome ?? "",
    authorName: brief.authorName ?? "",
    extraInstructions: brief.extraInstructions ?? "",
  };
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function BriefForm({ bookId, brief, locked, busy, hasOutline }: { bookId: string; brief: BookBrief; locked: boolean; busy: boolean; hasOutline: boolean }) {
  const update = useUpdateBrief(bookId);
  const form = useForm<BookBriefInput>({ resolver: zodResolver(bookBriefSchema), defaultValues: toFormValues(brief), mode: "onTouched" });
  const { register, control, setValue, handleSubmit, reset, formState } = form;
  const { errors, isDirty } = formState;
  const bookType = useWatch({ control, name: "bookType" }) ?? "guide";
  const chapterCount = Number(useWatch({ control, name: "chapterCount" }) ?? 8);
  const wordsPerChapter = Number(useWatch({ control, name: "wordsPerChapter" }) ?? 1500);
  const readOnly = locked || busy;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(values);
      reset(toFormValues(saved));
      toast.success(hasOutline ? "Brief saved. Regenerate the outline to apply it." : "Brief saved");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-5">
        <SectionCard title="The idea" description="What the book is about. The outline and every chapter are planned from this.">
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-medium">Book type</p>
              <BookTypePicker value={bookType} disabled={readOnly} onChange={(t) => setValue("bookType", t, { shouldDirty: true })} />
            </div>
            <Field label="Book idea" htmlFor="topic" error={errors.topic?.message} hint="One or two sentences about who it's for and what they'll get.">
              <Textarea id="topic" rows={3} aria-invalid={!!errors.topic} {...register("topic")} />
            </Field>
            <Field label="Working title (optional)" htmlFor="title" hint="The final title is set on the outline.">
              <Input id="title" {...register("title")} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Readers & voice" description="Who's reading and how the book should sound.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Who is it for?" htmlFor="targetAudience" error={errors.targetAudience?.message} className="sm:col-span-2">
              <Input id="targetAudience" {...register("targetAudience")} />
            </Field>
            <Field label="Book language" htmlFor="language" hint={hasOutline ? "Changing it needs a new outline in that language." : "The whole book is written in this language."}>
              <Select id="language" {...register("language")}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name === l.nativeName ? l.name : `${l.name} — ${l.nativeName}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reader's level" htmlFor="knowledgeLevel">
              <Select id="knowledgeLevel" {...register("knowledgeLevel")}>
                {KNOWLEDGE_LEVELS.map((k) => <option key={k} value={k}>{enumLabel(k)}</option>)}
              </Select>
            </Field>
            <Field label="Tone" htmlFor="tone">
              <Select id="tone" {...register("tone")}>
                {TONES.map((t) => <option key={t} value={t}>{enumLabel(t)}</option>)}
              </Select>
            </Field>
            <Field label="Depth" htmlFor="depth">
              <Select id="depth" {...register("depth")}>
                {DEPTHS.map((d) => <option key={d} value={d}>{enumLabel(d)}</option>)}
              </Select>
            </Field>
            <Field label="Reader's main problem (optional)" htmlFor="readerProblem" className="sm:col-span-2">
              <Input id="readerProblem" {...register("readerProblem")} />
            </Field>
            <Field label="What will they be able to do after reading? (optional)" htmlFor="readerOutcome" className="sm:col-span-2">
              <Input id="readerOutcome" {...register("readerOutcome")} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Length" description="Used when the outline is planned. Chapter lengths can still be adjusted on the outline.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={`Chapters: ${chapterCount}`} htmlFor="chapterCount" hint="Including introduction and conclusion.">
              <input id="chapterCount" type="range" min={3} max={20} className="mt-3 w-full accent-[var(--color-primary)]" {...register("chapterCount", { valueAsNumber: true })} />
            </Field>
            <Field label="Words per chapter" htmlFor="wordsPerChapter">
              <Select id="wordsPerChapter" {...register("wordsPerChapter", { valueAsNumber: true })}>
                {WORD_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                {!WORD_PRESETS.some((p) => p.value === wordsPerChapter) && <option value={wordsPerChapter}>Custom (~{wordsPerChapter.toLocaleString()})</option>}
              </Select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Style & publishing details" description="Optional. Everything here guides the writer; nothing is required.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Author name" htmlFor="authorName" hint="Shown on the title page.">
              <Input id="authorName" autoComplete="name" {...register("authorName")} />
            </Field>
            {STYLE_FIELDS.map(([key, label, max, placeholder]) => (
              <Field key={key} label={label} htmlFor={key} error={errors[key]?.message}>
                <Input id={key} maxLength={max} placeholder={placeholder} {...register(key)} />
              </Field>
            ))}
            <Field label="Preferred terminology" htmlFor="terminology" className="sm:col-span-2" hint="Words to use or avoid, one per line.">
              <Textarea id="terminology" rows={3} maxLength={2000} {...register("terminology")} />
            </Field>
            <Field label="Anything else the writer should know?" htmlFor="extraInstructions" className="sm:col-span-2">
              <Textarea id="extraInstructions" rows={3} maxLength={2000} {...register("extraInstructions")} />
            </Field>
          </div>
        </SectionCard>
      </fieldset>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <span className="me-auto text-sm text-muted-foreground" role="status">{isDirty ? "Unsaved changes" : "All changes saved"}</span>
          <Button type="button" variant="ghost" disabled={!isDirty || update.isPending} onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" /> Discard
          </Button>
          <Button type="submit" disabled={!isDirty} loading={update.isPending}>
            <Save className="h-4 w-4" /> Save brief
          </Button>
          {hasOutline && !isDirty && (
            <Link href={`/app/books/${bookId}/outline`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
              Go to outline <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </form>
  );
}

export function BriefScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const { data: book, isPending, error, refetch } = useBook(bookId);

  // Pending, not loading: before the session is known the query is disabled, and a
  // disabled query is pending without loading. The server render and the first
  // client render then both show the loader instead of disagreeing.
  if (isPending && !error) return <PageLoader />;
  if (error || !book) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /></div>;

  // Mirrors the server: the brief is frozen once any chapter is written, and
  // can't change while a job is running.
  const locked = book.chapters.some((c) => c.status === "done");
  const busy = Boolean(book.activeJob);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Book brief</h2>
        <p className="text-sm text-muted-foreground">The plan the AI writes from. Change it before the outline and chapters are generated.</p>
      </div>
      {locked && (
        <Alert tone="info" className="mb-5 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" /> Chapters have been written from this brief, so it&apos;s read-only. Edit the text in the editor instead.
        </Alert>
      )}
      {!locked && busy && <Alert tone="info" className="mb-5">The brief can be edited once the current {book.activeJob?.type === "outline" ? "outline" : "writing"} job finishes.</Alert>}
      {/* Keyed on the book's update time so a saved or refreshed brief reloads the form. */}
      <BriefForm key={book.updatedAt} bookId={bookId} brief={book.brief} locked={locked} busy={busy} hasOutline={Boolean(book.outline)} />
    </div>
  );
}
