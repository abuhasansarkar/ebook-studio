"use client";

import { ServiceStatusPanel } from "@/components/app/service-status";

/**
 * The live service status.
 *
 * The probes are public, so this panel answers even when the operator's own
 * session has just expired — which is exactly when an operator needs to know
 * whether the service or the session is at fault.
 */
export function StatusPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These are the same probes the platform runs to decide whether to route traffic to this instance. A degraded
        dependency is named rather than hidden, so an incident can be told apart from a slow query.
      </p>
      <ServiceStatusPanel />
    </div>
  );
}
