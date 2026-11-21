"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge, Progress, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useGenerationJob } from "@/lib/queries";
import type { GenerationJob } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

const STATUS_TONE = {
  queued: "neutral",
  running: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
} as const;

/**
 * One generation run, opened on its own.
 *
 * The book screen shows the job as a progress bar. This shows the record
 * behind it: what it cost, what it produced, and — when it failed — the error
 * the server recorded. The run id is the reference a customer quotes when they
 * ask for help, so it is copyable.
 */
export function GenerationJobDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const detail = useGenerationJob(jobId);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const job = detail.data;

  return (
    <Dialog open onClose={onClose} title="Writing run details" description={`Run reference ${jobId}`}>
      {detail.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading the run…
        </p>
      ) : detail.isError ? (
        <Alert tone="danger">{errorMessage(detail.error)}</Alert>
      ) : job ? (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge>
          </div>

          {job.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {job.progress} of {job.total} chapters
                </span>
              </div>
              <Progress value={job.total ? (job.progress / job.total) * 100 : 0} />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Sections saved</span>
            <span className="font-medium">{formatNumber(job.savedSections ?? 0)}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Credits</span>
            <span className="font-medium">
              {formatNumber(job.creditsCharged)} charged
              {job.creditsReserved > 0 && ` · ${formatNumber(job.creditsReserved)} still reserved`}
            </span>
          </div>

          {job.model && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium">{job.model}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Started</span>
            <span className="font-medium">{timeAgo(job.createdAt)}</span>
          </div>

          {job.finishedAt && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Finished</span>
              <span className="font-medium">{timeAgo(job.finishedAt)}</span>
            </div>
          )}

          {job.error && (
            <Alert tone="danger">
              <span className="font-semibold">The run stopped.</span> {job.error}
            </Alert>
          )}

          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Run reference</p>
            <p className="mt-0.5 break-all font-mono text-xs">{job.id}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(job.id);
                    setCopied(true);
                    setCopyFailed(false);
                  } catch {
                    setCopyFailed(true);
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Reference copied" : "Copy reference"}
              </Button>
              {copyFailed && <span className="text-xs text-danger">Copy failed. Select the reference and copy it manually.</span>}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

/** The job type guard used by the generate screen to pick which run to show. */
export function isChapterJob(job: GenerationJob | null | undefined): job is GenerationJob {
  return Boolean(job) && job?.type === "chapters";
}
