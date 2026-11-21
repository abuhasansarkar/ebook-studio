"use client";

import { Activity, HeartPulse, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, DetailList, DetailRow, PageLoader, StatusDot } from "@/components/ui/misc";
import { useHealth, useLiveness, useReadiness } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

/**
 * The service status panel.
 *
 * Three probes answer three different questions, and the panel keeps them
 * apart rather than collapsing them into one word:
 *
 * - **Live** — the process is up and answering requests.
 * - **Ready** — every dependency the product needs is reachable. This is the
 *   one that says a book can be generated right now.
 * - **Health** — the database and the queue are reachable. It covers less than
 *   readiness, so it is the quicker check when the service feels slow.
 *
 * A failed probe is a fact about a dependency, not a diagnosis, so nothing
 * here guesses at a cause.
 */
export function ServiceStatusPanel() {
  const live = useLiveness();
  const ready = useReadiness();
  const health = useHealth();

  const checking = live.isPending || ready.isPending || health.isPending;

  /** The last moment a probe answered, so a stale panel is visible as stale. */
  const lastChecked = [live.dataUpdatedAt, ready.dataUpdatedAt, health.dataUpdatedAt].filter(Boolean);
  const lastCheckedAt = lastChecked.length ? Math.max(...lastChecked) : 0;

  const refresh = () => {
    void live.refetch();
    void ready.refetch();
    void health.refetch();
  };

  if (checking && !live.data && !ready.data && !health.data) {
    return <PageLoader label="Checking the service…" />;
  }

  return (
    <Card className="overflow-hidden" data-testid="service-status">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4.5 w-4.5 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Service status</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} data-testid="refresh-status">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </Button>
      </div>

      <DetailList>
        <DetailRow label="Liveness">
          {live.error ? (
            <StatusDot tone="danger" label="Unreachable" />
          ) : live.data ? (
            <StatusDot tone="success" label={live.data.status === "alive" ? "Alive" : live.data.status} />
          ) : (
            <StatusDot tone="neutral" label="Unknown" />
          )}
        </DetailRow>

        <DetailRow label="Readiness">
          {ready.error ? (
            <StatusDot tone="danger" label="Unreachable" />
          ) : ready.data ? (
            <StatusDot
              tone={ready.data.status === "ready" ? "success" : "warning"}
              label={ready.data.status === "ready" ? "Ready" : "Degraded"}
            />
          ) : (
            <StatusDot tone="neutral" label="Unknown" />
          )}
        </DetailRow>

        <DetailRow label="Health">
          {health.error ? (
            <StatusDot tone="danger" label="Unreachable" />
          ) : health.data ? (
            <StatusDot
              tone={health.data.status === "ok" ? "success" : "warning"}
              label={health.data.status === "ok" ? "OK" : "Degraded"}
            />
          ) : (
            <StatusDot tone="neutral" label="Unknown" />
          )}
        </DetailRow>
      </DetailList>

      {ready.data ? (
        <div className="border-t border-border px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">Dependencies</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(ready.data.checks).map(([name, ok]) => (
              <StatusDot
                key={name}
                tone={ok ? "success" : "danger"}
                label={`${DEPENDENCY_LABEL[name] ?? name} — ${ok ? "available" : "unavailable"}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {health.data ? (
        <div className="border-t border-border px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">Core services</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusDot
              tone={health.data.checks.database ? "success" : "danger"}
              label={`Database — ${health.data.checks.database ? "reachable" : "unreachable"}`}
            />
            <StatusDot
              tone={health.data.checks.redis ? "success" : "danger"}
              label={`Queue — ${health.data.checks.redis ? "reachable" : "unreachable"}`}
            />
          </div>
        </div>
      ) : null}

      {lastCheckedAt ? (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground" data-testid="status-checked">
          <Activity className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
          Last checked {timeAgo(new Date(lastCheckedAt).toISOString())}
        </p>
      ) : null}
    </Card>
  );
}

/** The plain-language name of each dependency the readiness probe checks. */
const DEPENDENCY_LABEL: Record<string, string> = {
  database: "Database",
  redis: "Queue",
  workers: "Workers",
  storage: "File storage",
};
