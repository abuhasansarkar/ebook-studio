"use client";

import { OperationActivity } from "./operation-activity";
import { GenerationJobDetail } from "./generation-job-detail";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Clock, FileDown, ListTree, PenLine, Square, Wand2 } from "lucide-react";
import { chapterCredits, getLanguage } from "@ebook/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, Card, ErrorState, PageLoader, Progress, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { qk, useBook, useBookAction, useCredits } from "@/lib/queries";
import type { ChapterMeta } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

function ChapterRow({ ch, dir, writingNow }: { ch: ChapterMeta; dir: string; writingNow: boolean }) {
  const icon =
    ch.status === "done" ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Written" /> : ch.status === "generating" ? (writingNow ? <Spinner className="h-5 w-5" label="Writing" /> : <Clock className="h-5 w-5 text-muted-foreground" aria-label="Queued" />) : ch.status === "failed" ? <AlertTriangle className="h-5 w-5 text-danger" /> : <Circle className="h-5 w-5 text-border" />;
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      {icon}
      <span className="w-6 text-sm font-semibold text-muted-foreground">{ch.position + 1}</span>
      <span dir={dir} className="min-w-0 flex-1 truncate text-sm font-medium">{ch.title}</span>
      <span className="text-xs text-muted-foreground">
        {ch.status === "done" ? `${formatNumber(ch.wordCount)} words` : ch.status === "generating" ? (writingNow ? "Writing now…" : "Queued") : ch.status === "failed" ? "Failed" : "Waiting"}
      </span>
    </li>
  );
}

export function GenerateScreen({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const qc = useQueryClient();
  const { data: book, isPending, error, refetch } = useBook(bookId);
  const credits = useCredits();
  const actions = useBookAction(bookId);
  const wasActive = useRef(false);
  const [jobDetailId, setJobDetailId] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);

  const job = book?.activeJob?.type === "chapters" ? book.activeJob : null;

  // When a job finishes, refresh credits and the chapter list, and tell the user.
  useEffect(() => {
    if (job) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current && book) {
      wasActive.current = false;
      void qc.invalidateQueries({ queryKey: qk.credits });
      void qc.invalidateQueries({ queryKey: qk.chapters(bookId) });
      const last = book.lastJob;
      if (last?.status === "completed") toast.success("All chapters are written!");
      else if (last?.status === "cancelled") toast("Writing stopped. Finished chapters are kept.");
      else if (last?.status === "failed") toast.error("Writing stopped because of an error.");
    }
  }, [job, book, bookId, qc]);

  // Pending, not loading: before the session is known the query is disabled, and a
  // disabled query is pending without loading. The server render and the first
  // client render then both show the loader instead of disagreeing.
  if (isPending && !error) return <PageLoader />;
  if (error || !book) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /></div>;

  const lang = getLanguage(book.language);
  const approved = Boolean(book.outline?.approvedAt);
  const done = book.chapters.filter((c) => c.status === "done");
  const remaining = book.chapters.filter((c) => c.status !== "done");
  const cost = remaining.reduce((s, c) => s + chapterCredits(c.targetWords ?? 1500), 0);
  const balance = credits.data?.wallet.balance;
  const totalWords = done.reduce((s, c) => s + c.wordCount, 0);
  const lastFailed = !job && book.lastJob?.type === "chapters" && book.lastJob.status === "failed" ? book.lastJob : null;
  const lastFinished = !job && book.lastJob?.type === "chapters" && book.lastJob.finishedAt ? book.lastJob : null;
  // Chapters are written in order, so the first unfinished one is the one being written.
  const writingNowId = job ? book.chapters.find((c) => c.status === "generating")?.id : undefined;

  if ((!approved && done.length !== book.chapters.length) || book.chapters.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <Card className="p-8 text-center">
          <ListTree className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Approve your outline first</h2>
          <p className="mt-2 text-sm text-muted-foreground">Chapters are written from the approved outline, so you stay in control of the structure.</p>
          <Link href={`/app/books/${bookId}/outline`} className={buttonVariants({ className: "mt-6" })}>Review outline</Link>
        </Card>
      </div>
    );
  }

  const start = async () => {
    try {
      await actions.startGeneration.mutateAsync();
      wasActive.current = true;
      setConfirmStart(false);
    } catch (err) {
      setConfirmStart(false);
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {job ? (
        <Card className="mb-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Spinner /> {job.cancelRequested ? "Stopping after the current section…" : job.recovering ? "Recovering interrupted writing…" : "Writing your book"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.progress} of {job.total} chapters done · {job.savedSections ?? 0} sections saved. You can leave this page — writing continues in the background.
              </p>
            </div>
            <Button variant="secondary" onClick={() => actions.cancelGeneration.mutate(undefined, { onSuccess: () => toast("Stopping after the current section…"), onError: (err) => toast.error(errorMessage(err)) })} loading={actions.cancelGeneration.isPending} disabled={job.cancelRequested}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Saved sections resume automatically after a worker interruption. Stopping or retrying after an error keeps finished chapters, and a retry reuses the prose the failed run already wrote, so you are only charged for the chapters it still has to write.</p>
          <Progress className="mt-5" value={job.total ? (job.progress / job.total) * 100 : 0} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setJobDetailId(job.id)}>
              Run details
            </Button>
          </div>
        </Card>
      ) : remaining.length > 0 ? (
        <Card className="mb-6 p-6">
          {lastFailed && (
            <Alert tone="danger" className="mb-4">
              Writing stopped: {lastFailed.error ?? "unknown error"}. Finished chapters are kept and you were only charged for them.
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => setJobDetailId(lastFailed.id)}>
                  See what happened
                </Button>
              </div>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{done.length === 0 ? "Ready to write" : `${remaining.length} chapter${remaining.length === 1 ? "" : "s"} left to write`}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Uses about <strong className="text-foreground">{cost} credits</strong>
                {balance !== undefined && ` · you have ${balance}`}. Credits are reserved now and unused ones are returned.
              </p>
            </div>
            <Button size="lg" onClick={() => setConfirmStart(true)} loading={actions.startGeneration.isPending} disabled={balance !== undefined && balance < cost}>
              <Wand2 className="h-4 w-4" /> {done.length === 0 ? "Write my book" : lastFailed ? "Retry" : "Continue writing"}
            </Button>
          </div>
          {balance !== undefined && balance < cost && (
            <Alert tone="warning" className="mt-4">
              You need {cost - balance} more credits. Shorten chapters in the outline or remove some to reduce the cost.
            </Alert>
          )}
        </Card>
      ) : (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5 text-success" /> Your book is written
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {book.chapters.length} chapters · {formatNumber(totalWords)} words. Now polish it in the editor.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/app/books/${bookId}/export`} className={buttonVariants({ variant: "secondary" })}>
              <FileDown className="h-4 w-4" /> Export
            </Link>
            <Link href={`/app/books/${bookId}/editor`} className={buttonVariants()}>
              <PenLine className="h-4 w-4" /> Open editor
            </Link>
          </div>
        </Card>
      )}

      {lastFinished && (
        <p className="mb-4 text-sm text-muted-foreground" data-testid="last-run-charges">
          Last run {lastFinished.status}: <strong className="text-foreground">{lastFinished.creditsCharged} credits charged</strong>
          {lastFinished.creditsReserved > lastFinished.creditsCharged && <> · {lastFinished.creditsReserved - lastFinished.creditsCharged} reserved credits returned</>}.{" "}
          <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => setJobDetailId(lastFinished.id)}>
            Run details
          </button>
        </p>
      )}

      <Card>
        <ul className="divide-y divide-border" aria-label="Chapters">
          {book.chapters.map((ch) => (
            <ChapterRow key={ch.id} ch={ch} dir={lang.dir} writingNow={ch.id === writingNowId} />
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        onConfirm={() => void start()}
        title={done.length === 0 ? "Write your book?" : lastFailed ? "Retry writing?" : "Continue writing?"}
        description={`From outline version ${book.outline?.version ?? "—"}${book.outline?.approvedAt ? " (approved)" : ""}. Finished chapters are kept and not charged again.`}
        confirmLabel={`Reserve ${cost} credits and start`}
        tone="primary"
        busy={actions.startGeneration.isPending}
      >
        <ul className="space-y-1">
          <li>{remaining.length} chapter{remaining.length === 1 ? "" : "s"} to write: {remaining.slice(0, 3).map((c) => c.title).join(", ")}{remaining.length > 3 ? `, and ${remaining.length - 3} more` : ""}.</li>
          <li>Estimated cost: about {cost} credits{balance !== undefined ? `, leaving about ${Math.max(balance - cost, 0)} of your ${balance}` : ""}.</li>
          <li>You&apos;re charged only for what is written; unused credits are returned when the run ends.</li>
        </ul>
      </ConfirmDialog>
      <OperationActivity bookId={bookId} />
      {jobDetailId ? <GenerationJobDetail jobId={jobDetailId} onClose={() => setJobDetailId(null)} /> : null}
    </div>
  );
}
