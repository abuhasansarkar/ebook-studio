"use client";

import { Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useOpsDashboard } from "@/lib/studio-queries";
import { formatNumber } from "@/lib/utils";

/** One number on the overview. */
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "warning" | "success" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : ""
        }`}
        data-testid="admin-stat-value"
      >
        {value}
      </p>
    </Card>
  );
}

/** The headline numbers. */
export function OverviewPanel() {
  const dashboard = useOpsDashboard();
  if (dashboard.isLoading) return <PageLoader />;
  if (dashboard.error) return <ErrorState message={errorMessage(dashboard.error)} onRetry={() => void dashboard.refetch()} />;
  const data = dashboard.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Figures cover {data.range}. Totals are all-time unless a label says otherwise.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={formatNumber(data.users.total)} />
        <Stat label="New in range" value={formatNumber(data.users.newInRange)} />
        <Stat label="Live books" value={formatNumber(data.books.live)} />
        <Stat label="Exports ready" value={formatNumber(data.exports.ready)} />
        <Stat
          label="Jobs active"
          value={formatNumber(data.jobs.active)}
          tone={data.jobs.queuedOlderThanLimit > 0 ? "warning" : undefined}
        />
        <Stat
          label={`Queued over ${data.jobs.queueAgeLimitMinutes} min`}
          value={formatNumber(data.jobs.queuedOlderThanLimit)}
          tone={data.jobs.queuedOlderThanLimit > 0 ? "warning" : undefined}
        />
        <Stat label="Jobs failed" value={formatNumber(data.jobs.failed)} tone={data.jobs.failed > 0 ? "danger" : undefined} />
        <Stat label="Exports failed" value={formatNumber(data.exports.failed)} tone={data.exports.failed > 0 ? "danger" : undefined} />
        <Stat label="Payments succeeded" value={formatNumber(data.payments.succeeded)} tone="success" />
        <Stat label="Payments failed" value={formatNumber(data.payments.failed)} tone={data.payments.failed > 0 ? "danger" : undefined} />
        <Stat label="Credits net in range" value={formatNumber(data.credits.netInRange)} />
        <Stat label="Failed email deliveries" value={formatNumber(data.deliveries.failed)} tone={data.deliveries.failed > 0 ? "danger" : undefined} />
        <Stat label="Unresolved incidents" value={formatNumber(data.incidents.unresolved)} tone={data.incidents.unresolved > 0 ? "warning" : undefined} />
        <Stat label="Open support requests" value={formatNumber(data.support.open)} />
      </div>
    </div>
  );
}
