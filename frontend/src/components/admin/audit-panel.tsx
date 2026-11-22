"use client";

import { Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useAuditTrail } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/** The immutable audit trail. */
export function AuditPanel() {
  const audit = useAuditTrail(undefined);
  if (audit.isLoading) return <PageLoader />;
  if (audit.error) return <ErrorState message={errorMessage(audit.error)} onRetry={() => void audit.refetch()} />;

  return (
    <Card className="divide-y divide-border">
      {(audit.data ?? []).map((entry) => (
        <div key={entry.id} className="px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">{entry.action}</p>
            <p className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.actor?.name ?? "system"} ({entry.actorRole ?? "—"}) → {entry.targetType} {entry.targetId} ·{" "}
            {entry.outcome}
          </p>
          <p className="mt-1 text-xs">{entry.reason}</p>
        </div>
      ))}
      {(audit.data ?? []).length === 0 && (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No operator actions have been recorded yet.</p>
      )}
    </Card>
  );
}
