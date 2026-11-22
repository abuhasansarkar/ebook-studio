"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Alert, Badge, Card, PageLoader } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useAlertDeliveries, useIncidents, useRaiseAlert, useResolveIncident } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/** The incident and alert history. */
export function IncidentsPanel() {
  const incidents = useIncidents();
  const alerts = useAlertDeliveries();
  const resolve = useResolveIncident();
  const raise = useRaiseAlert();
  const [problem, setProblem] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("warning");

  if (incidents.isLoading || alerts.isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Raise an alert</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The alert goes to the configured destination and is recorded whether or not it arrived.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <Input
            id="alert-summary"
            className="bg-background"
            value={summary}
            placeholder="Queue backlog is growing"
            onChange={(event) => setSummary(event.target.value)}
            data-testid="alert-summary"
          />
          <Select
            id="alert-severity"
            className="bg-background"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            data-testid="alert-severity"
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
        <Button
          className="mt-4"
          loading={raise.isPending}
          disabled={!summary.trim()}
          onClick={() => {
            setProblem(null);
            raise.mutate(
              { kind: "queue_backlog", summary, severity },
              {
                onSuccess: (result) => {
                  setSummary("");
                  if (!result.delivered) {
                    setProblem(`The alert was recorded but not delivered: ${result.error ?? "no confirmation"}.`);
                  }
                  void alerts.refetch();
                  void incidents.refetch();
                },
                onError: (err) => setProblem(errorMessage(err)),
              },
            );
          }}
          data-testid="raise-alert"
        >
          <Bell className="h-4 w-4" />
          Raise alert
        </Button>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Open incidents</h3>
        <Card className="divide-y divide-border">
          {(incidents.data ?? []).map((incident) => (
            <div key={incident.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{incident.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {incident.kind} · {timeAgo(incident.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={incident.severity === "critical" ? "danger" : incident.severity === "warning" ? "warning" : "neutral"}>
                  {incident.severity}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={resolve.isPending}
                  onClick={() => {
                    setProblem(null);
                    resolve.mutate(
                      { incidentId: incident.id, resolution: "Resolved from the operations console." },
                      {
                        onSuccess: () => void incidents.refetch(),
                        onError: (err) => setProblem(errorMessage(err)),
                      },
                    );
                  }}
                >
                  Resolve
                </Button>
              </div>
            </div>
          ))}
          {(incidents.data ?? []).length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nothing is broken right now.</p>
          )}
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Alert deliveries</h3>
        <Card className="divide-y divide-border">
          {(alerts.data ?? []).map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{alert.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {alert.kind} → {alert.destination} · {timeAgo(alert.createdAt)}
                </p>
                {alert.error && <p className="mt-1 text-xs text-danger">{alert.error}</p>}
              </div>
              <Badge tone={alert.status === "delivered" ? "success" : alert.status === "failed" ? "danger" : "neutral"}>
                {alert.status}
              </Badge>
            </div>
          ))}
          {(alerts.data ?? []).length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">No alerts have been sent.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
