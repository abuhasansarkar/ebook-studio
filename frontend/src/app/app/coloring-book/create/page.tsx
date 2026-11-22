"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  Compass,
  Feather,
  Layers,
  Palette,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  COLORING_AUDIENCE_LABELS,
  COLORING_AUDIENCES,
  COLORING_CREDIT_COSTS,
  COLORING_DIFFICULTIES,
  COLORING_DIFFICULTY_LABELS,
  COLORING_LINE_THICKNESS,
  COLORING_LINE_THICKNESS_LABELS,
  COLORING_PAGE_COUNTS,
  COLORING_STYLE_CATALOG,
  COLORING_STYLES,
  COLORING_TRIM_SIZE_META,
  COLORING_TRIM_SIZES,
  coloringBookBriefSchema,
  estimateColoringCredits,
  type ColoringBookBriefInput,
  type ColoringStyle,
} from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, PageLoader } from "@/components/ui/misc";
import { useCreateColoringPlan } from "@/lib/coloring-queries";
import { useCredits } from "@/lib/queries";
import { cn, formatNumber } from "@/lib/utils";

const STEPS = [
  { id: "idea", title: "Idea & Title", desc: "Topic and concept" },
  { id: "style", title: "Art Style", desc: "Visual aesthetic" },
  { id: "audience", title: "Audience & Lines", desc: "Age and thickness" },
  { id: "format", title: "Pages & Format", desc: "Trim and printing" },
] as const;

function CreateColoringBookWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTopic = searchParams.get("topic") || "";

  const [step, setStep] = useState(0);
  const createPlan = useCreateColoringPlan();
  const credits = useCredits();

  const form = useForm<ColoringBookBriefInput>({
    resolver: zodResolver(coloringBookBriefSchema),
    defaultValues: {
      topic: initialTopic,
      title: "",
      subtitle: "",
      language: "en",
      artStyle: "kawaii_chibi",
      targetAudience: "children",
      difficulty: "easy",
      lineThickness: "medium",
      trimSize: "8.5x11",
      singleSided: true,
      bleed: false,
      pageCount: 24,
      density: "balanced",
      authorName: "",
    },
    mode: "onTouched",
  });

  const { register, control, setValue, trigger, handleSubmit, formState } = form;
  const currentStyle = useWatch({ control, name: "artStyle" });
  const pageCount = useWatch({ control, name: "pageCount" }) || 24;
  const singleSided = useWatch({ control, name: "singleSided" });
  const trimSize = useWatch({ control, name: "trimSize" });
  const targetAudience = useWatch({ control, name: "targetAudience" });
  const lineThickness = useWatch({ control, name: "lineThickness" });

  const estimatedCredits = estimateColoringCredits(pageCount);
  const userBalance = credits.data?.wallet.balance ?? 0;
  const hasEnoughCredits = userBalance >= COLORING_CREDIT_COSTS.plan;

  const nextStep = async () => {
    let valid = true;
    if (step === 0) {
      valid = await trigger(["topic", "title"]);
    }
    if (valid) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const prevStep = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!hasEnoughCredits) {
      toast.error(
        `You need at least ${COLORING_CREDIT_COSTS.plan} credits to generate a coloring book plan (current balance: ${userBalance}). Please top up your credits.`,
      );
      return;
    }

    try {
      toast.loading(`Generating coloring book plan… (${COLORING_CREDIT_COSTS.plan} credits)`);
      const res = await createPlan.mutateAsync(values);
      toast.dismiss();
      toast.success("Coloring book plan created!");
      router.push(`/app/coloring-book/${res.book.id}/plan`);
    } catch (err) {
      toast.dismiss();
      toast.error((err as Error).message || "Failed to create coloring book plan");
    }
  });

  return (
    <div suppressHydrationWarning className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {/* Top Breadcrumb */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/app/coloring-book")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Coloring Books
        </button>
      </div>

      {/* Step Progress Bar */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map((s, idx) => {
            const isCurrent = step === idx;
            const isDone = step > idx;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3 transition-colors",
                  isCurrent
                    ? "border-primary bg-primary-soft/50 text-foreground"
                    : isDone
                      ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                      : "border-border bg-surface/50 text-muted-foreground opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isCurrent
                      ? "bg-primary text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{s.title}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Card */}
      <Card className="p-6 sm:p-8">
        <form onSubmit={onSubmit}>
          {/* STEP 1: IDEA & TITLE */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">What is your coloring book about?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Describe your idea in a sentence or two. The AI will plan distinct, engaging scene illustrations.
                </p>
              </div>

              <Field label="Book Topic / Theme *" htmlFor="topic" error={formState.errors.topic?.message}>
                <Textarea
                  id="topic"
                  {...register("topic")}
                  rows={3}
                  placeholder="e.g. Cute farm animals having little adventures in flower fields, drinking tea, and picking fresh strawberries"
                />
              </Field>

              {/* Inspiration Chips */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Inspiration:
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    "Cute baby farm animals on sunny countryside adventures",
                    "Magical enchanted forest creatures with fairy mushroom homes",
                    "Intricate blooming floral mandalas and relaxing botanical garden leaves",
                    "Fun prehistoric dinosaurs exploring jungle volcanoes",
                    "Under the sea ocean turtles, playful dolphins and coral reefs",
                    "Big construction vehicles, monster trucks, and airplanes",
                  ].map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setValue("topic", idea, { shouldValidate: true })}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      + {idea.slice(0, 38)}…
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Working Title (Optional)" htmlFor="title" hint="Leave blank to let AI name it automatically">
                  <Input id="title" {...register("title")} placeholder="e.g. Cute Farm Adventures" />
                </Field>
                <Field label="Author Name (Optional)" htmlFor="authorName">
                  <Input id="authorName" {...register("authorName")} placeholder="e.g. Studio Blossom" />
                </Field>
              </div>
            </div>
          )}

          {/* STEP 2: ART STYLE */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Choose your visual art style</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The AI compiles strict line-art prompt directives ensuring every page maintains this aesthetic.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {COLORING_STYLES.map((styleKey) => {
                  const meta = COLORING_STYLE_CATALOG[styleKey];
                  const isSelected = currentStyle === styleKey;
                  return (
                    <div
                      key={styleKey}
                      onClick={() => setValue("artStyle", styleKey)}
                      className={cn(
                        "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all hover:border-primary/60",
                        isSelected
                          ? "border-primary bg-primary-soft/30 ring-2 ring-primary/40 shadow-sm"
                          : "border-border bg-surface/60 hover:bg-surface",
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">{meta.label}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{meta.description}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {meta.keywords.slice(0, 3).map((kw) => (
                          <span key={kw} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: AUDIENCE & COMPLEXITY */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Audience & Line Thickness</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tune the line weight and complexity so it is effortless and delightful for your target colorist.
                </p>
              </div>

              {/* Target Audience */}
              <div>
                <label className="text-sm font-semibold text-foreground">Target Audience</label>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {COLORING_AUDIENCES.map((aud) => {
                    const isSelected = targetAudience === aud;
                    return (
                      <div
                        key={aud}
                        onClick={() => setValue("targetAudience", aud)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3.5 transition-colors",
                          isSelected
                            ? "border-primary bg-primary-soft/40 ring-1 ring-primary"
                            : "border-border bg-surface hover:bg-muted/50",
                        )}
                      >
                        <div className="font-semibold text-sm">{COLORING_AUDIENCE_LABELS[aud]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Line Thickness */}
              <div>
                <label className="text-sm font-semibold text-foreground">Outline Stroke Weight</label>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {COLORING_LINE_THICKNESS.map((thick) => {
                    const isSelected = lineThickness === thick;
                    return (
                      <div
                        key={thick}
                        onClick={() => setValue("lineThickness", thick)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3.5 transition-colors text-center",
                          isSelected
                            ? "border-primary bg-primary-soft/40 ring-1 ring-primary"
                            : "border-border bg-surface hover:bg-muted/50",
                        )}
                      >
                        <div className="font-semibold text-sm">{COLORING_LINE_THICKNESS_LABELS[thick]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <Field label="Composition Complexity" htmlFor="difficulty">
                  <Select id="difficulty" {...register("difficulty")}>
                    {COLORING_DIFFICULTIES.map((diff) => (
                      <option key={diff} value={diff}>
                        {COLORING_DIFFICULTY_LABELS[diff]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {/* STEP 4: PAGES & FORMAT */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Book Format & Page Count</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select your physical paperback specifications. Amazon KDP requires a minimum of 24 pages.
                </p>
              </div>

              {/* Page Count */}
              <div>
                <label className="text-sm font-semibold text-foreground">Interior Illustrated Pages</label>
                <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {COLORING_PAGE_COUNTS.map((cnt) => {
                    const isSelected = pageCount === cnt;
                    const creditsCost = estimateColoringCredits(cnt);
                    return (
                      <div
                        key={cnt}
                        onClick={() => setValue("pageCount", cnt)}
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center rounded-xl border p-4 text-center transition-all",
                          isSelected
                            ? "border-primary bg-primary-soft/40 ring-2 ring-primary/40 shadow-sm"
                            : "border-border bg-surface hover:bg-muted/50",
                        )}
                      >
                        <span className="text-2xl font-bold">{cnt}</span>
                        <span className="text-xs text-muted-foreground">pages</span>
                        <Badge tone="neutral" className="mt-2 text-[10px]">
                          {creditsCost} credits
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trim Size */}
              <div>
                <label className="text-sm font-semibold text-foreground">Paperback Trim Size</label>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {COLORING_TRIM_SIZES.map((t) => {
                    const meta = COLORING_TRIM_SIZE_META[t];
                    const isSelected = trimSize === t;
                    return (
                      <div
                        key={t}
                        onClick={() => setValue("trimSize", t)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3.5 transition-colors",
                          isSelected
                            ? "border-primary bg-primary-soft/40 ring-1 ring-primary"
                            : "border-border bg-surface hover:bg-muted/50",
                        )}
                      >
                        <div className="font-semibold text-sm">{meta.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Single-Sided Printing Toggle */}
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("singleSided")}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-semibold text-foreground">
                      Single-Sided Printing (Recommended for Physical Coloring)
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Inserts a blank page behind each illustration so markers and pens do not bleed through onto
                      another drawing. Total physical book pages will be {pageCount * 2 + 2} pages.
                    </p>
                  </div>
                </label>
              </div>

              {/* Planning Cost Callout */}
              <div className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-4 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Coins className="h-4 w-4 text-primary" />
                  <span>Planning Cost: {COLORING_CREDIT_COSTS.plan} Credits</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>
                    Your Balance: <strong className="text-foreground">{formatNumber(userBalance)}</strong> credits
                  </span>
                  {!hasEnoughCredits && (
                    <Link href="/app/settings/billing" className="text-primary font-semibold underline hover:text-primary-hover">
                      Get Credits →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={prevStep} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <div />
            )}

            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} className="gap-1.5">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  type="submit"
                  size="lg"
                  loading={createPlan.isPending}
                  disabled={createPlan.isPending || (credits.isSuccess && !hasEnoughCredits)}
                  className="gap-2 shadow-md"
                >
                  <Sparkles className="h-5 w-5" /> Generate Book Plan ({COLORING_CREDIT_COSTS.plan} Credits)
                </Button>
                {credits.isSuccess && !hasEnoughCredits && (
                  <span className="text-xs text-destructive font-medium">
                    Insufficient balance ({userBalance}/{COLORING_CREDIT_COSTS.plan} credits)
                  </span>
                )}
              </div>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function CreateColoringBookPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading creator…" />}>
      <CreateColoringBookWizard />
    </Suspense>
  );
}
