"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { operationSchema, type Operation } from "@ebook/shared";
import { api, errorMessage } from "@/lib/api";
import { useOperation } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Spinner } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";

const terminal = new Set(["completed", "failed", "cancelled", "needs_review"]);
const labels: Record<Operation["state"], string> = {
  submitting: "Submitting", queued: "Waiting to start", running: "In progress", cancel_requested: "Stopping",
  completed: "Completed", failed: "Failed", cancelled: "Cancelled", needs_review: "Needs attention",
};
const kinds: Record<string, string> = { create_book: "Create book and outline", outline: "Generate outline", chapters: "Write chapters", export: "Export PDF" };

export function OperationActivity({ bookId }: { bookId: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const activity = useQuery({
    queryKey: ["operations", bookId],
    queryFn: async () => {
      const result = await api.get<{ operations: unknown[] }>(`/books/${bookId}/operations?limit=5`);
      return result.operations.map((value) => operationSchema.parse(value));
    },
    refetchInterval: (q) => q.state.data?.some((op) => !terminal.has(op.state)) ? 2000 : false,
    refetchOnWindowFocus: true,
  });
  return (
    <>
      <section className="mt-8 rounded-xl border border-border bg-surface p-5" aria-label="Recent activity">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Recent activity</h3>
        <Button variant="ghost" size="sm" disabled={activity.isFetching} onClick={() => void activity.refetch()}>Refresh</Button>
      </div>
      {activity.isPending ? <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading activity…</span>
        : activity.error ? <Alert tone="danger">{errorMessage(activity.error)}</Alert>
        : !activity.data?.length ? <p className="text-sm text-muted-foreground">New writing and export requests will appear here.</p>
        : <ul className="divide-y divide-border">{activity.data.map((op) => (
          <li key={op.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">{kinds[op.kind] ?? "Book task"}</p>
              <p className="text-xs text-muted-foreground" role="status">{labels[op.state]}{op.total > 0 ? ` · ${op.progress} of ${op.total}` : ""}</p>
              {op.state === "needs_review" && <p className="mt-1 max-w-lg text-xs text-warning">This request needs checking before you repeat it. Keep its support reference.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetailId(op.id)}>Details</Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                try { await navigator.clipboard.writeText(op.id); setCopiedId(op.id); setCopyFailedId(null); }
                catch { setCopyFailedId(op.id); }
              }}>{copiedId === op.id ? "Reference copied" : "Copy support reference"}</Button>
            </div>
            {copyFailedId === op.id && <p className="w-full break-all text-xs text-muted-foreground">Support reference: {op.id}</p>}
          </li>
        ))}</ul>}
      </section>
      {detailId ? <OperationDetail operationId={detailId} onClose={() => setDetailId(null)} /> : null}
    </>
  );
}

/**
 * One operation, opened on its own.
 *
 * The strip above is a summary of the last few requests. When a customer
 * quotes a support reference, this shows the live state of that one request
 * rather than a value copied from a list that may be stale.
 */
function OperationDetail({ operationId, onClose }: { operationId: string; onClose: () => void }) {
  const detail = useOperation(operationId);

  return (
    <Dialog open onClose={onClose} title="Request details" description={`Support reference ${operationId}`}>
      {detail.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading the request…
        </p>
      ) : detail.isError ? (
        <Alert tone="danger">{errorMessage(detail.error)}</Alert>
      ) : detail.data ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Kind</span>
            <span className="font-medium">{kinds[detail.data.kind] ?? "Book task"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">State</span>
            <Badge
              tone={
                detail.data.state === "completed"
                  ? "success"
                  : detail.data.state === "failed"
                    ? "danger"
                    : "warning"
              }
            >
              {labels[detail.data.state]}
            </Badge>
          </div>
          {detail.data.total > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {detail.data.progress} of {detail.data.total}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Started</span>
            <span className="font-medium">{new Date(detail.data.createdAt).toLocaleString()}</span>
          </div>
          {detail.data.resourceId ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Resource</span>
              <span className="break-all font-mono text-xs">{detail.data.resourceId}</span>
            </div>
          ) : null}
          {detail.data.state === "needs_review" ? (
            <Alert tone="warning">
              This request needs checking before you repeat it. Quote the reference above when you ask for
              help.
            </Alert>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
