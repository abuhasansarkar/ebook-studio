"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { operationSchema, type Operation } from "@ebook/shared";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/misc";

const terminal = new Set(["completed", "failed", "cancelled", "needs_review"]);
const labels: Record<Operation["state"], string> = {
  submitting: "Submitting", queued: "Waiting to start", running: "In progress", cancel_requested: "Stopping",
  completed: "Completed", failed: "Failed", cancelled: "Cancelled", needs_review: "Needs attention",
};
const kinds: Record<string, string> = { create_book: "Create book and outline", outline: "Generate outline", chapters: "Write chapters", export: "Export PDF" };

export function OperationActivity({ bookId }: { bookId: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
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
            <Button variant="secondary" size="sm" onClick={async () => {
              try { await navigator.clipboard.writeText(op.id); setCopiedId(op.id); setCopyFailedId(null); }
              catch { setCopyFailedId(op.id); }
            }}>{copiedId === op.id ? "Reference copied" : "Copy support reference"}</Button>
            {copyFailedId === op.id && <p className="w-full break-all text-xs text-muted-foreground">Support reference: {op.id}</p>}
          </li>
        ))}</ul>}
    </section>
  );
}
