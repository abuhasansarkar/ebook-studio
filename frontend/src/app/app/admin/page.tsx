"use client";

import { useState } from "react";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  Coins,
  FileClock,
  LifeBuoy,
  ScrollText,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import type { AdminPermission } from "@ebook/shared";
import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useMounted } from "@/lib/use-mounted";
import {
  useAdminAuthority,
  useAlertDeliveries,
  useAuditTrail,
  useBackups,
  useCreateBackup,
  useCreditAdjustment,
  useDeleteBackup,
  useIncidents,
  useJobIntervention,
  useOpsDashboard,
  useOpsBooks,
  useOpsJobs,
  useOpsPayments,
  useOpsUsers,
  useRaiseAlert,
  useRefundPayment,
  useRehearseRestore,
  useResolveIncident,
  useRoleChange,
  useRoleHolders,
  useSupportReply,
  useSupportRequests,
} from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/**
 * S13 — the operations console.
 *
 * Every panel here reads or writes through a permission the server checks. The
 * console hides the panels an operator may not use, so the screen is not a
 * wall of refusals; but the hiding is a courtesy. The API is the control, and
 * it refuses the same actions on its own.
 */

type Panel =
  | "overview"
  | "users"
  | "books"
  | "jobs"
  | "payments"
  | "incidents"
  | "support"
  | "roles"
  | "backups"
  | "audit";

const PANELS: { id: Panel; label: string; icon: typeof Activity; permission?: AdminPermission }[] = [
  { id: "overview", label: "Overview", icon: Activity, permission: "ops.read" },
  { id: "users", label: "Customers", icon: Users, permission: "ops.read" },
  { id: "books", label: "Books", icon: BookOpen, permission: "ops.read" },
  { id: "jobs", label: "Jobs", icon: FileClock, permission: "ops.read" },
  { id: "payments", label: "Payments", icon: Coins, permission: "billing.read" },
  { id: "incidents", label: "Incidents and alerts", icon: ShieldAlert, permission: "ops.read" },
  { id: "support", label: "Support", icon: LifeBuoy, permission: "support.reply" },
  { id: "roles", label: "Roles", icon: Users, permission: "roles.manage" },
  { id: "backups", label: "Backups", icon: Archive, permission: "backup.manage" },
  { id: "audit", label: "Audit trail", icon: ScrollText, permission: "audit.read" },
];

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

export default function AdminPage() {
  const authority = useAdminAuthority();
  const [panel, setPanel] = useState<Panel>("overview");
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

/** The headline numbers. */
function OverviewPanel() {
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

/** The customer list, with credit adjustments. */
function UsersPanel() {
  const users = useOpsUsers(undefined);
  const adjust = useCreditAdjustment();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [credits, setCredits] = useState("100");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (users.isLoading) return <PageLoader />;
  if (users.error) return <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} />;

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}
      <Card className="divide-y divide-border">
        {(users.data ?? []).map((user) => (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {user.bookCount} book{user.bookCount === 1 ? "" : "s"} · {formatNumber(user.creditBalance)} credits
                {user.roles.length > 0 && ` · ${user.roles.join(", ")}`}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTarget({ id: user.id, name: user.name });
                setProblem(null);
              }}
              data-testid="adjust-credits"
            >
              <Coins className="h-4 w-4" />
              Adjust credits
            </Button>
          </div>
        ))}
        {(users.data ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No customers yet.</p>
        )}
      </Card>

      {target && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Adjust credits for {target.name}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Credits (a negative number takes credits away)" htmlFor="adjust-amount">
              <Input
                id="adjust-amount"
                type="number"
                className="bg-background"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
                data-testid="adjust-amount"
              />
            </Field>
            <Field
              label="Reason (at least ten characters — it is written into the audit trail)"
              htmlFor="adjust-reason"
              className="sm:col-span-2"
            >
              <Textarea
                id="adjust-reason"
                className="min-h-[80px] bg-background"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-testid="adjust-reason"
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              loading={adjust.isPending}
              disabled={reason.trim().length < 10 || !Number.isFinite(Number(credits)) || Number(credits) === 0}
              onClick={() => {
                setProblem(null);
                adjust.mutate(
                  { userId: target.id, credits: Number(credits), reason },
                  {
                    onSuccess: () => {
                      setTarget(null);
                      setReason("");
                      void users.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  },
                );
              }}
              data-testid="submit-adjustment"
            >
              Apply adjustment
            </Button>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** The job list, with retry and cancel. */
function JobsPanel() {
  const jobs = useOpsJobs();
  const intervene = useJobIntervention();
  const [problem, setProblem] = useState<string | null>(null);

  if (jobs.isLoading) return <PageLoader />;
  if (jobs.error) return <ErrorState message={errorMessage(jobs.error)} onRetry={() => void jobs.refetch()} />;

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}
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
              {job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  job.status === "failed" ? "danger" : job.status === "done" ? "success" : job.status === "running" ? "primary" : "neutral"
                }
              >
                {job.status}
              </Badge>
              {(job.status === "queued" || job.status === "running") && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={intervene.isPending}
                    onClick={() => {
                      setProblem(null);
                      intervene.mutate(
                        { jobId: job.id, action: "retry", reason: "Retried from the operations console." },
                        {
                          onSuccess: () => void jobs.refetch(),
                          onError: (err) => setProblem(errorMessage(err)),
                        },
                      );
                    }}
                    data-testid="retry-job"
                  >
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={intervene.isPending}
                    onClick={() => {
                      setProblem(null);
                      intervene.mutate(
                        { jobId: job.id, action: "cancel", reason: "Cancelled from the operations console." },
                        {
                          onSuccess: () => void jobs.refetch(),
                          onError: (err) => setProblem(errorMessage(err)),
                        },
                      );
                    }}
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
    </div>
  );
}

/** The payment list, with refunds. */
function PaymentsPanel() {
  const payments = useOpsPayments();
  const refund = useRefundPayment();
  const [problem, setProblem] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (payments.isLoading) return <PageLoader />;
  if (payments.error) return <ErrorState message={errorMessage(payments.error)} onRetry={() => void payments.refetch()} />;

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <Card className="divide-y divide-border">
        {(payments.data ?? []).map((payment) => (
          <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{payment.customerEmail ?? payment.userId}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {payment.provider} · {(payment.amountMinor / 100).toFixed(2)} {payment.currency} · {formatNumber(payment.credits)} credits ·{" "}
                {payment.planName ?? "no plan"} · {timeAgo(payment.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "neutral"}>
                {payment.status.replace(/_/g, " ")}
              </Badge>
              {payment.status === "succeeded" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTarget(payment.id);
                    setReason("");
                    setProblem(null);
                  }}
                  data-testid="refund-payment"
                >
                  Refund
                </Button>
              )}
            </div>
          </div>
        ))}
        {(payments.data ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No payments have been taken yet.</p>
        )}
      </Card>

      {target && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Refund this payment</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The credits are taken back and the capabilities the payment granted are withdrawn.
          </p>
          <Field label="Reason (at least ten characters)" htmlFor="refund-reason" className="mt-4">
            <Textarea
              id="refund-reason"
              className="min-h-[80px] bg-background"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-testid="refund-reason"
            />
          </Field>
          <div className="mt-4 flex gap-2">
            <Button
              loading={refund.isPending}
              disabled={reason.trim().length < 10}
              onClick={() => {
                setProblem(null);
                refund.mutate(
                  { paymentId: target, reason },
                  {
                    onSuccess: () => {
                      setTarget(null);
                      setReason("");
                      void payments.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  },
                );
              }}
              data-testid="submit-refund"
            >
              Refund payment
            </Button>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** The incident and alert history. */
function IncidentsPanel() {
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

/** The support queue. */
function SupportPanel() {
  const requests = useSupportRequests(undefined);
  const reply = useSupportReply();
  const [problem, setProblem] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (requests.isLoading) return <PageLoader />;
  if (requests.error) return <ErrorState message={errorMessage(requests.error)} onRetry={() => void requests.refetch()} />;

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}
      {(requests.data ?? []).map((request) => (
        <Card key={request.id} className="p-5" data-testid={`support-request-${request.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{request.subject}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {request.customerEmail ?? "unknown customer"} · {request.category} · {timeAgo(request.createdAt)} ·{" "}
                <span className="font-mono">{request.correlationId}</span>
              </p>
            </div>
            <Badge tone={request.status === "answered" ? "success" : request.status === "open" ? "warning" : "neutral"}>
              {request.status}
            </Badge>
          </div>
          <p className="mt-3 text-sm">{request.message}</p>
          {request.context && <p className="mt-1 text-xs text-muted-foreground">Context: {request.context}</p>}
          {request.response && (
            <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Your reply</p>
              <p className="mt-1">{request.response}</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Textarea
              id={`reply-${request.id}`}
              className="min-h-[80px] flex-1 bg-background"
              placeholder="Write your reply…"
              value={drafts[request.id] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
              aria-label={`Reply to ${request.subject}`}
              data-testid="support-reply"
            />
            <Button
              className="self-end"
              loading={reply.isPending}
              disabled={!(drafts[request.id] ?? "").trim()}
              onClick={() => {
                setProblem(null);
                reply.mutate(
                  { requestId: request.id, response: drafts[request.id] ?? "" },
                  {
                    onSuccess: () => {
                      setDrafts((current) => ({ ...current, [request.id]: "" }));
                      void requests.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  },
                );
              }}
              data-testid="send-reply"
            >
              Send reply
            </Button>
          </div>
        </Card>
      ))}
      {(requests.data ?? []).length === 0 && (
        <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No support requests" description="Nothing is waiting for an answer." />
      )}
    </div>
  );
}

/** The role holders, with grant and revoke. */
function RolesPanel() {
  const roles = useRoleHolders();
  const change = useRoleChange();
  const [problem, setProblem] = useState<string | null>(null);
  const [target, setTarget] = useState<{ userId: string; name: string } | null>(null);
  const [role, setRole] = useState("support");
  const [reason, setReason] = useState("");

  if (roles.isLoading) return <PageLoader />;
  if (roles.error) return <ErrorState message={errorMessage(roles.error)} onRetry={() => void roles.refetch()} />;

  const holders = roles.data?.holders ?? [];

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <Card className="divide-y divide-border">
        {holders.map((holder) => (
          <div key={holder.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{holder.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{holder.user.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{holder.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="primary">{holder.role}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProblem(null);
                  change.mutate(
                    { userId: holder.userId, role: holder.role, reason: "No longer needed.", action: "revoke" },
                    {
                      onSuccess: () => void roles.refetch(),
                      onError: (err) => setProblem(errorMessage(err)),
                    },
                  );
                }}
              >
                Revoke
              </Button>
            </div>
          </div>
        ))}
        {holders.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nobody holds an operator role yet.</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Grant a role</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Customer" htmlFor="role-user-id">
            <Input
              id="role-user-id"
              className="bg-background"
              placeholder="User id"
              value={target?.userId ?? ""}
              onChange={(event) => setTarget({ userId: event.target.value, name: event.target.value })}
              data-testid="role-user-id"
            />
          </Field>
          <Field label="Role" htmlFor="role-select">
            <Select
              id="role-select"
              className="bg-background"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              data-testid="role-select"
            >
              {(roles.data?.roles ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason (at least ten characters)" htmlFor="role-reason" className="sm:col-span-2">
            <Textarea
              id="role-reason"
              className="min-h-[80px] bg-background"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-testid="role-reason"
            />
          </Field>
        </div>
        <Button
          className="mt-4"
          loading={change.isPending}
          disabled={!target?.userId.trim() || reason.trim().length < 10}
          onClick={() => {
            setProblem(null);
            change.mutate(
              { userId: target!.userId.trim(), role, reason, action: "grant" },
              {
                onSuccess: () => {
                  setTarget(null);
                  setReason("");
                  void roles.refetch();
                },
                onError: (err) => setProblem(errorMessage(err)),
              },
            );
          }}
          data-testid="grant-role"
        >
          Grant role
        </Button>
      </Card>
    </div>
  );
}

/** The backups, with restore rehearsals. */
function BackupsPanel() {
  const backups = useBackups();
  const create = useCreateBackup();
  const rehearse = useRehearseRestore();
  const remove = useDeleteBackup();
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null);

  if (backups.isLoading) return <PageLoader />;
  if (backups.error) return <ErrorState message={errorMessage(backups.error)} onRetry={() => void backups.refetch()} />;

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}
      {result && <Alert tone="info">{result}</Alert>}
      <ConfirmDialog
        open={Boolean(deletingBackup)}
        onClose={() => setDeletingBackup(null)}
        onConfirm={() => {
          if (!deletingBackup) return;
          const name = deletingBackup;
          setDeletingBackup(null);
          setProblem(null);
          remove.mutate(name, {
            onSuccess: () => {
              setResult(`The backup “${name}” was deleted.`);
              void backups.refetch();
            },
            onError: (err) => setProblem(errorMessage(err)),
          });
        }}
        title="Delete this backup?"
        description={deletingBackup ? `“${deletingBackup}” will be removed from disk.` : undefined}
        confirmLabel="Delete backup"
        busy={remove.isPending}
      >
        <p>The dump on disk is removed. This cannot be undone.</p>
      </ConfirmDialog>

      <div className="flex justify-end">
        <Button
          loading={create.isPending}
          onClick={() => {
            setProblem(null);
            create.mutate(undefined, {
              onSuccess: () => void backups.refetch(),
              onError: (err) => setProblem(errorMessage(err)),
            });
          }}
          data-testid="create-backup"
        >
          <Archive className="h-4 w-4" />
          Take a backup now
        </Button>
      </div>

      <Card className="divide-y divide-border">
        {(backups.data ?? []).map((backup) => (
          <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{backup.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatNumber(Math.round(backup.bytes / 1024))} KB · {timeAgo(backup.createdAt)} ·{" "}
                {Object.entries(backup.counts)
                  .map(([key, value]) => `${key} ${value}`)
                  .join(", ")}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">sha256 {backup.databaseSha256}</p>
            </div>
            <div className="flex items-center gap-2">
              {backup.restoreVerified && <Badge tone="success">restore verified</Badge>}
              <Button
                variant="secondary"
                size="sm"
                loading={rehearse.isPending}
                onClick={() => {
                  setProblem(null);
                  setResult(null);
                  rehearse.mutate(backup.name, {
                    onSuccess: (response) => {
                      setResult(
                        response.restore.verified
                          ? `Restore of ${response.restore.name} into ${response.restore.targetDatabase} matched the manifest.`
                          : `Restore of ${response.restore.name} did not match the manifest. ${response.restore.notes}`,
                      );
                      void backups.refetch();
                    },
                    onError: (err) => setProblem(errorMessage(err)),
                  });
                }}
                data-testid="rehearse-restore"
              >
                Rehearse restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingBackup(backup.name)}
                data-testid="delete-backup"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ))}
        {(backups.data ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No backups have been taken yet.</p>
        )}
      </Card>
    </div>
  );
}

/**
 * Every book on the platform.
 *
 * The list is deliberately read-only: an operator can see what a customer
 * has written, but the manuscript itself is the customer's, and the API
 * offers no way for an operator to edit it.
 */
function BooksPanel() {
  const books = useOpsBooks();
  const [search, setSearch] = useState("");

  if (books.isLoading) return <PageLoader />;
  if (books.error) return <ErrorState message={errorMessage(books.error)} onRetry={() => void books.refetch()} />;

  const rows = books.data ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter(
        (book) =>
          book.title.toLowerCase().includes(needle) || book.ownerEmail.toLowerCase().includes(needle),
      )
    : rows;

  return (
    <div className="space-y-4">
      <Input
        className="w-full max-w-sm bg-background"
        placeholder="Search by title or owner"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search books"
        data-testid="admin-book-search"
      />
      <Card className="divide-y divide-border">
        {visible.map((book) => (
          <div key={book.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{book.title}</p>
              <p className="truncate text-xs text-muted-foreground">{book.ownerEmail}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {book.chapterCount} chapter{book.chapterCount === 1 ? "" : "s"} · {book.exportCount} export
                {book.exportCount === 1 ? "" : "s"} · {timeAgo(book.createdAt)}
              </p>
            </div>
            <Badge tone={book.status === "failed" ? "danger" : "neutral"}>{book.status.replace(/_/g, " ")}</Badge>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No books yet." : "No books match that search."}
          </p>
        )}
      </Card>
    </div>
  );
}

/** The immutable audit trail. */
function AuditPanel() {
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
