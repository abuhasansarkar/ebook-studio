"use client";

import { useSession } from "@/lib/auth-client";
import { usePlanningDraft } from "@/components/books/use-planning-draft";
import { BookTypePicker, enumLabel as cap } from "@/components/books/book-type-picker";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import {
  CREDIT_COSTS,
  DEPTHS,
  KNOWLEDGE_LEVELS,
  LANGUAGES,
  TONES,
  bookBriefSchema,
  estimateBookCredits,
  type BookBriefInput,
} from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, PageLoader } from "@/components/ui/misc";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateBook, useCredits } from "@/lib/queries";
import { cn } from "@/lib/utils";

const IDEA_EXAMPLES = [
  "A beginner's guide to meal prep for busy parents",
  "How freelancers can find their first 10 clients",
  "Personal finance basics for university students",
];

const STEPS = [
  { title: "Your idea", fields: ["bookType", "topic", "title"] },
  { title: "Readers & voice", fields: ["targetAudience", "knowledgeLevel", "readerProblem", "readerOutcome", "language", "tone"] },
  { title: "Length & details", fields: ["chapterCount", "wordsPerChapter", "depth", "authorName", "extraInstructions"] },
] as const;

function CreateBookForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const createBook = useCreateBook();
  const credits = useCredits();

  const form = useForm<BookBriefInput>({
    resolver: zodResolver(bookBriefSchema),
    defaultValues: {
      bookType: "guide",
      topic: "",
      title: "",
      targetAudience: "General readers",
      knowledgeLevel: "beginner",
      readerProblem: "",
      readerOutcome: "",
      language: "en",
      tone: "friendly",
      depth: "standard",
      chapterCount: 8,
      wordsPerChapter: 1500,
      authorName: "",
      extraInstructions: "",
    },
    mode: "onTouched",
  });
  const planning = usePlanningDraft(form);
  const { register, control, setValue, formState, trigger, handleSubmit } = form;
  const errors = formState.errors;
  const bookType = useWatch({ control, name: "bookType" });
  const chapterCount = Number(useWatch({ control, name: "chapterCount" }) ?? 8);
  const wordsPerChapter = Number(useWatch({ control, name: "wordsPerChapter" }) ?? 1500);
  const estimate = CREDIT_COSTS.outline + estimateBookCredits(chapterCount, wordsPerChapter);
  const balance = credits.data?.wallet.balance;

  const next = async () => {
    const ok = await trigger(STEPS[step].fields as unknown as FieldPath<BookBriefInput>[]);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await createBook.mutateAsync(values);
      await planning.clear();
      if (res.outlineError) toast.warning(`Book created, but the outline couldn't start: ${res.outlineError.message}`);
      else toast.success("Planning your outline…");
      router.push(`/app/books/${res.book.id}/outline`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <PageHeader title="Create a new eBook" description="Tell us about your book. Only the idea is required — everything else has a sensible default." />

      {!planning.ready && <p role="status" className="mb-4 text-sm">Checking for an unfinished brief…</p>}
      {planning.error && <Alert tone="warning" className="mb-4">{planning.error}</Alert>}
      {planning.recovery && <Alert tone="info" className="mb-4"><p>An unfinished book brief was found in this tab.</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { planning.recover(); setStep(0); }}>Recover brief</Button><Button size="sm" variant="secondary" onClick={() => void planning.discard()}>Start fresh</Button></div></Alert>}
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 items-center gap-2">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", i <= step ? "bg-primary text-white" : "bg-muted text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              {i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
            {i < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded", i < step ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) void next();
          else void onSubmit(e);
        }}
        noValidate
      >
        <fieldset disabled={!planning.ready || !!planning.recovery}>
        <Card className="p-6 sm:p-8">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-medium">What kind of book?</p>
                <BookTypePicker value={bookType ?? "guide"} onChange={(t) => setValue("bookType", t, { shouldDirty: true })} />
              </div>
              <Field label="Describe your book idea" htmlFor="topic" error={errors.topic?.message} hint="One or two sentences. Be specific about who it's for and what they'll get.">
                <Textarea id="topic" rows={3} placeholder={IDEA_EXAMPLES[0]} aria-invalid={!!errors.topic} {...register("topic")} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {IDEA_EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setValue("topic", ex, { shouldValidate: true })} className="cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {ex}
                  </button>
                ))}
              </div>
              <Field label="Working title (optional)" htmlFor="title" hint="Leave empty and the AI will suggest one.">
                <Input id="title" {...register("title")} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Who is it for?" htmlFor="targetAudience" error={errors.targetAudience?.message} className="sm:col-span-2">
                <Input id="targetAudience" placeholder="e.g. Working parents with young children" {...register("targetAudience")} />
              </Field>
              <Field label="Book language" htmlFor="language" hint="The whole book is written in this language.">
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
                  {KNOWLEDGE_LEVELS.map((k) => (
                    <option key={k} value={k}>{cap(k)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tone" htmlFor="tone">
                <Select id="tone" {...register("tone")}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>{cap(t)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Depth" htmlFor="depth">
                <Select id="depth" {...register("depth")}>
                  {DEPTHS.map((d) => (
                    <option key={d} value={d}>{cap(d)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Reader's main problem (optional)" htmlFor="readerProblem" className="sm:col-span-2">
                <Input id="readerProblem" placeholder="e.g. No time to cook healthy meals during the week" {...register("readerProblem")} />
              </Field>
              <Field label="What will they be able to do after reading? (optional)" htmlFor="readerOutcome" className="sm:col-span-2">
                <Input id="readerOutcome" placeholder="e.g. Prep a week of meals in two hours on Sunday" {...register("readerOutcome")} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`Chapters: ${chapterCount}`} htmlFor="chapterCount" hint="Including introduction and conclusion.">
                <input id="chapterCount" type="range" min={3} max={20} className="mt-3 w-full accent-[var(--color-primary)]" {...register("chapterCount", { valueAsNumber: true })} />
              </Field>
              <Field label="Words per chapter" htmlFor="wordsPerChapter">
                <Select id="wordsPerChapter" {...register("wordsPerChapter", { valueAsNumber: true })}>
                  <option value={800}>Short (~800)</option>
                  <option value={1500}>Standard (~1,500)</option>
                  <option value={2500}>Long (~2,500)</option>
                  <option value={4000}>In depth (~4,000)</option>
                </Select>
              </Field>
              <Field label="Author name (optional)" htmlFor="authorName" hint="Shown on the title page." className="sm:col-span-2">
                <Input id="authorName" autoComplete="name" {...register("authorName")} />
              </Field>
              <details className="sm:col-span-2">
                <summary className="cursor-pointer font-semibold">Optional publishing and style details</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {([['purpose', 'Book purpose', 300], ['readerAge', 'Reader age range', 100], ['writingStyle', 'Writing style', 300], ['pointOfView', 'Point of view', 100], ['brandName', 'Author brand', 120]] as const).map(([key, label, max]) => <Field key={key} label={label} htmlFor={key}><Input id={key} maxLength={max} {...register(key)} /></Field>)}
                  <Field label="Preferred terminology" htmlFor="terminology" className="sm:col-span-2"><Textarea id="terminology" maxLength={2000} {...register('terminology')} /></Field>
                </div>
              </details>
              <Field label="Anything else the writer should know? (optional)" htmlFor="extraInstructions" className="sm:col-span-2">
                <Textarea id="extraInstructions" rows={3} placeholder="e.g. Use metric units. Include a shopping checklist in every chapter." {...register("extraInstructions")} />
              </Field>
              <div className="sm:col-span-2">
                <Alert tone={balance !== undefined && balance < estimate ? "warning" : "info"}>
                  <strong>Estimated cost: about {estimate} credits</strong> ({CREDIT_COSTS.outline} for the outline, the rest when chapters are written). You have {balance ?? "…"} credits.
                  {balance !== undefined && balance < estimate && " You can still create the outline and write fewer or shorter chapters."}
                </Alert>
              </div>
            </div>
          )}
        </Card>

        {createBook.error && !(createBook.error instanceof ApiError && createBook.error.status === 400) && (
          <Alert tone="danger" className="mt-4">{errorMessage(createBook.error)}</Alert>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0} className={step === 0 ? "invisible" : ""}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="submit" disabled={!planning.ready || !!planning.recovery}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!planning.ready || !!planning.recovery} loading={createBook.isPending}>
              <Sparkles className="h-4 w-4" /> Create outline
            </Button>
          )}
        </div>
        </fieldset>
      </form>
    </div>
  );
}

export default function CreateBookPage() {
  const { data: session } = useSession();
  return session?.user ? <CreateBookForm key={session.user.id} /> : <PageLoader />;
}
