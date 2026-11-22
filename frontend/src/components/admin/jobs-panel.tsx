"use client";

import { useState } from "react";
import { Alert, Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useJobIntervention, useOpsJobs } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/** The job list, with retry and cancel. */
const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export function JobsPanel() {
  const [status, setStatus] = useState("");
  const jobs = useOpsJobs(true, status || undefined);
  const intervene = useJobIntervention();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ jobId: string; action: "retry" | "cancel"; label: string } | null>(null);
  const [reason, setReason] = useState("");

  if (jobs.isLoading) return <PageLoader />;
  if (jobs.error) return <ErrorState message={errorMessage(jobs.error)} onRetry={() => void jobs.refetch()} />;

  const ask = (jobId: string, action: "retry" | "cancel", label: string) => {
    setProblem(null);
    setReason("");
    setPending({ jobId, action, label });
  };

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status" htmlFor="job-status-filter">
          <Select id="job-status-filter" className="h-9 w-44 bg-background py-0" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All jobs</option>
            {JOB_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="pb-2 text-xs text-muted-foreground">Newest 100 shown.</p>
      </div>
      <Card className="divide-y divide-border">
        {(jobs.data ?? []).map((job) => (
          <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {job.type} · {job.bookTitle ?? job.bookId}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {job.status} · {job.progress}/{job.total} · reserved {job.creditsReserved}, charged {job.creditsCharged} ·{" "}
                {timeAgo(job.createdAt)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dispatched {job.dispatchAttempts} time{job.dispatchAttempts === 1 ? "" : "s"}
                {job.cancelRequested ? " · cancel requested" : ""}
                {job.status === "running" && job.leaseExpiresAt
                  ? new Date(job.leaseExpiresAt).getTime() < jobs.dataUpdatedAt
                    ? " · worker claim lapsed, it will be picked up again"
                    : ` · claimed by a worker until ${new Date(job.leaseExpiresAt).toLocaleTimeString()}`
                  : ""}
                {job.finishedAt ? ` · finished ${timeAgo(job.finishedAt)}` : ""}
              </p>
              {job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  job.status === "failed" ? "danger" : job.status === "completed" ? "success" : job.status === "running" ? "primary" : "neutral"
                }
              >
                {job.status}
              </Badge>
              {(job.status === "queued" || job.status === "running") && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={intervene.isPending}
                    onClick={() => ask(job.id, "retry", `${job.type} · ${job.bookTitle ?? job.bookId}`)}
                    data-testid="retry-job"
                  >
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger-soft"
                    disabled={intervene.isPending}
                    onClick={() => ask(job.id, "cancel", `${job.type} · ${job.bookTitle ?? job.bookId}`)}
                    data-testid="cancel-job"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {(jobs.data ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No jobs have run yet.</p>
        )}
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === "cancel" ? "Cancel this job?" : "Retry this job?"}
        description={
          pending?.action === "cancel"
            ? `${pending.label}. The customer keeps finished work and is only charged for it.`
            : `${pending?.label ?? ""}. The job is released and picked up again by the queue within a minute.`
        }
        confirmLabel={pending?.action === "cancel" ? "Cancel job" : "Retry job"}
        cancelLabel="Back"
        tone="primary"
        busy={intervene.isPending}
        confirmDisabled={reason.trim().length < 10}
        onConfirm={() => {
          if (!pending) return;
          intervene.mutate(
            { jobId: pending.jobId, action: pending.action, reason: reason.trim() },
            {
              onSuccess: () => { setPending(null); void jobs.refetch(); },
              onError: (err) => { setPending(null); setProblem(errorMessage(err)); },
            },
          );
        }}
      >
        <Field label="Reason (recorded in the audit trail)" htmlFor="job-reason" hint={`At least ten characters · ${reason.trim().length}/10`}>
          <Textarea id="job-reason" className="min-h-[72px] bg-background" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
