"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { AdminPermission } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Badge, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useMounted } from "@/lib/use-mounted";
import { useAdminAuthority } from "@/lib/studio-queries";
import { PANELS, type Panel } from "@/components/admin/panels";
import { OverviewPanel } from "@/components/admin/overview-panel";
import { StatusPanel } from "@/components/admin/status-panel";
import { UsersPanel } from "@/components/admin/users-panel";
import { JobsPanel } from "@/components/admin/jobs-panel";
import { PaymentsPanel } from "@/components/admin/payments-panel";
import { IncidentsPanel } from "@/components/admin/incidents-panel";
import { SupportPanel } from "@/components/admin/support-panel";
import { RolesPanel } from "@/components/admin/roles-panel";
import { BackupsPanel } from "@/components/admin/backups-panel";
import { BooksPanel } from "@/components/admin/books-panel";
import { AuditPanel } from "@/components/admin/audit-panel";

/**
 * S13 — the operations console.
 *
 * Every panel here reads or writes through a permission the server checks. The
 * console hides the panels an operator may not use, so the screen is not a
 * wall of refusals; but the hiding is a courtesy. The API is the control, and
 * it refuses the same actions on its own.
 */

export default function AdminPage() {
  const authority = useAdminAuthority();
  // Null until the operator picks a tab: the first panel they may see is shown.
  const [picked, setPanel] = useState<Panel | null>(null);
  // The operator's roles come from the browser's query cache, so the screen
  // waits for the mount before it decides what to show. Without this the
  // server markup and the first client render disagree.
  const mounted = useMounted();

  const permissions = authority.data?.permissions ?? [];
  const can = (permission: AdminPermission) => permissions.includes(permission);

  if (!mounted || authority.isLoading) return <PageLoader label="Checking your permissions…" />;

  if (authority.error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <PageHeader title="Operations console" />
        <ErrorState message={errorMessage(authority.error)} onRetry={() => void authority.refetch()} />
      </div>
    );
  }

  const visiblePanels = PANELS.filter((item) => !item.permission || can(item.permission));
  // An operator without ops.read (e.g. support only) must not land on a panel they cannot use.
  const panel = picked && visiblePanels.some((item) => item.id === picked) ? picked : visiblePanels[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Operations console"
        description="The running state of the product: customers, jobs, money, incidents and the audit trail. Every action here is recorded."
        actions={
          authority.data && authority.data.roles.length > 0 ? (
            <Badge tone="primary">{authority.data.roles.join(", ")}</Badge>
          ) : undefined
        }
      />

      {visiblePanels.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="No operator permissions"
          description="Your account does not hold an operator role. Ask an administrator to grant one."
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {visiblePanels.map((item) => {
              const Icon = item.icon;
              const active = panel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPanel(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary-soft text-primary-hover" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  data-testid={`admin-panel-${item.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {panel === "overview" && <OverviewPanel />}
          {panel === "status" && <StatusPanel />}
          {panel === "users" && <UsersPanel />}
          {panel === "books" && <BooksPanel />}
          {panel === "jobs" && <JobsPanel />}
          {panel === "payments" && <PaymentsPanel />}
          {panel === "incidents" && <IncidentsPanel />}
          {panel === "support" && <SupportPanel />}
          {panel === "roles" && <RolesPanel />}
          {panel === "backups" && <BackupsPanel />}
          {panel === "audit" && <AuditPanel />}
        </>
      )}
    </div>
  );
}
