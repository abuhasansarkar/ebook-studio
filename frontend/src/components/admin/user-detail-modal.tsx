"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  CreditCard,
  FileClock,
  Layers,
  LifeBuoy,
  ScrollText,
  ShieldAlert,
  Trash2,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useAdminDeleteUser, useOpsUserDetail } from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import type { OpsUserDetail } from "@/lib/studio-types";

type TabId = "overview" | "books" | "financials" | "jobs" | "support-audit";

interface UserDetailModalProps {
  userId: string | null;
  onClose: () => void;
  onAdjustCredits?: (user: { id: string; name: string }) => void;
}

export function UserDetailModal({ userId, onClose, onAdjustCredits }: UserDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [copied, setCopied] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const deleteMutation = useAdminDeleteUser();

  const query = useOpsUserDetail(userId, Boolean(userId));

  const handleCopyId = (id: string) => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    try {
      await deleteMutation.mutateAsync({ userId: user.id, reason: deleteReason || "Admin user deletion" });
      toast.success(`User ${user.email} permanently deleted`);
      setConfirmDeleteUser(false);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const user = query.data;

  return (
    <Dialog
      open={Boolean(userId)}
      onClose={onClose}
      title={user ? user.name || "Customer details" : "Loading user details…"}
      description={user ? user.email : "Operational record and activity history"}
      className="max-w-4xl"
    >
      {query.isLoading && (
        <div className="py-12">
          <PageLoader label="Loading full customer data…" />
        </div>
      )}

      {query.error && (
        <div className="py-6">
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        </div>
      )}

      {user && (
        <div className="space-y-5">
          {/* Top Profile Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-hover font-semibold text-lg">
                {user.name ? user.name.slice(0, 2).toUpperCase() : <UserIcon className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-base">{user.name || "Unnamed user"}</h3>
                  {user.emailVerified ? (
                    <Badge tone="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge tone="warning" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Unverified
                    </Badge>
                  )}
                  {user.roles.filter((r) => r.isActive).map((role) => (
                    <Badge key={role.id} tone="primary">
                      {role.role}
                    </Badge>
                  ))}
                  {user.roles.filter((r) => r.isActive).length === 0 && (
                    <Badge tone="neutral">customer</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{user.email}</span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleCopyId(user.id)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                    title="Click to copy User ID"
                  >
                    <span>ID: {user.id.slice(0, 12)}…</span>
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <span>•</span>
                  <span>Joined {timeAgo(user.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onAdjustCredits && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAdjustCredits({ id: user.id, name: user.name })}
                >
                  <Coins className="h-4 w-4" />
                  Adjust credits
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDeleteUser(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete user
              </Button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border pb-2">
            {[
              { id: "overview" as TabId, label: "Overview", icon: Layers },
              { id: "books" as TabId, label: `Books (${user.books.length})`, icon: BookOpen },
              { id: "financials" as TabId, label: "Financials & Ledger", icon: CreditCard },
              { id: "jobs" as TabId, label: `Jobs (${user.jobs.length})`, icon: FileClock },
              {
                id: "support-audit" as TabId,
                label: `Support & Audit (${user.supportRequests.length + user.auditEntries.length})`,
                icon: LifeBuoy,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-primary-soft text-primary-hover font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {activeTab === "overview" && <OverviewTab user={user} />}
            {activeTab === "books" && <BooksTab user={user} />}
            {activeTab === "financials" && <FinancialsTab user={user} />}
            {activeTab === "jobs" && <JobsTab user={user} />}
            {activeTab === "support-audit" && <SupportAndAuditTab user={user} />}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteUser}
        onClose={() => {
          setConfirmDeleteUser(false);
          setDeleteReason("");
        }}
        onConfirm={handleDeleteUser}
        title={`Delete customer ${user?.name || ""}?`}
        description="This will permanently delete the customer account and tombstone their email address."
        confirmLabel="Delete User"
        tone="danger"
        busy={deleteMutation.isPending}
      >
        <p className="font-semibold text-foreground">
          Delete account for <span className="font-bold">{user?.email}</span>?
        </p>
        <ul className="mt-2 list-disc pl-4 space-y-1 text-xs text-muted-foreground">
          <li>All user data, books, and generation jobs will be deleted.</li>
          <li>The email address will be permanently tombstoned and cannot be reused.</li>
          <li>Privileged actions will be logged in the immutable audit trail.</li>
        </ul>
        <div className="mt-3">
          <label className="text-xs font-medium text-foreground block mb-1">Reason for deletion (audited):</label>
          <input
            type="text"
            className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-danger/20"
            placeholder="e.g. Terms violation, customer request, spam cleanup"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </Dialog>
  );
}

/** 1. Overview Tab */
function OverviewTab({ user }: { user: OpsUserDetail }) {
  const activeSub = user.subscriptions[0];

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Coins className="h-3.5 w-3.5 text-primary-hover" />
            Available Credits
          </p>
          <p className="mt-1 text-xl font-bold">{formatNumber(user.wallet.balance)}</p>
          {user.wallet.reserved > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatNumber(user.wallet.reserved)} reserved in-flight
            </p>
          )}
        </Card>

        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5 text-primary-hover" />
            Total Books
          </p>
          <p className="mt-1 text-xl font-bold">{user.books.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {user.books.reduce((acc, b) => acc + b.chapterCount, 0)} written chapters
          </p>
        </Card>

        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5 text-primary-hover" />
            Total Payments
          </p>
          <p className="mt-1 text-xl font-bold">{user.payments.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {user.payments.filter((p) => p.status === "succeeded").length} settled
          </p>
        </Card>

        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <FileClock className="h-3.5 w-3.5 text-primary-hover" />
            Generation Jobs
          </p>
          <p className="mt-1 text-xl font-bold">{user.jobs.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {user.jobs.filter((j) => j.status === "completed").length} completed
          </p>
        </Card>
      </div>

      {/* Subscription & Entitlements Section */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" />
            Subscription & Plan
          </h4>
          {activeSub ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Plan:</span>
                <span className="font-semibold">{activeSub.planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge tone={activeSub.status === "active" ? "success" : "warning"}>
                  {activeSub.status}
                </Badge>
              </div>
              {activeSub.currentPeriodEnd && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Period Ends:</span>
                  <span>{new Date(activeSub.currentPeriodEnd).toLocaleDateString()}</span>
                </div>
              )}
              {activeSub.canceledAt && (
                <div className="flex items-center justify-between text-danger">
                  <span>Cancelled on:</span>
                  <span>{new Date(activeSub.canceledAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Free Tier</p>
              <p className="text-xs mt-1">Author has no active paid recurring subscription.</p>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            Active Capabilities & Quotas
          </h4>
          {user.entitlements.length > 0 ? (
            <div className="space-y-1.5 text-xs">
              {user.entitlements.map((e) => (
                <div key={e.key} className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="font-mono text-muted-foreground">{e.key}</span>
                  <span className="font-semibold">
                    {typeof e.value === "object" ? JSON.stringify(e.value) : String(e.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">
              Default baseline capabilities apply: 10 chapters/book, 3 books max, standard queue.
            </p>
          )}
        </Card>
      </div>

      {/* Roles & Permissions History */}
      <Card className="p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4" />
          Operator Roles History
        </h4>
        {user.roles.length > 0 ? (
          <div className="divide-y divide-border text-xs">
            {user.roles.map((r) => (
              <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.isActive ? "primary" : "neutral"}>{r.role}</Badge>
                    <span className="text-muted-foreground">
                      {r.isActive ? "Active since" : "Revoked"} {new Date(r.grantedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.reason && <p className="mt-1 text-muted-foreground">Reason: {r.reason}</p>}
                </div>
                {r.grantedBy && <span className="text-muted-foreground text-[11px]">By: {r.grantedBy}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Standard customer with no elevated operator roles.</p>
        )}
      </Card>
    </div>
  );
}

/** 2. Books Tab */
function BooksTab({ user }: { user: OpsUserDetail }) {
  if (user.books.length === 0) {
    return <EmptyState icon={<BookOpen className="h-6 w-6" />} title="No books created" description="This customer has not created any books yet." />;
  }

  return (
    <Card className="divide-y divide-border text-xs sm:text-sm">
      {user.books.map((book) => (
        <div key={book.id} className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-lg space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate">{book.title}</span>
              <Badge tone={book.status === "completed" ? "success" : "neutral"}>{book.status}</Badge>
              <span className="text-muted-foreground text-xs uppercase font-mono">{book.language}</span>
            </div>
            {book.subtitle && <p className="text-xs text-muted-foreground truncate">{book.subtitle}</p>}
            <p className="text-[11px] text-muted-foreground">
              {book.chapterCount} chapter{book.chapterCount === 1 ? "" : "s"} • {book.exportCount} exports • {book.sourceCount} sources
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            <p>Updated {timeAgo(book.updatedAt)}</p>
            <p className="text-[11px] font-mono mt-0.5">ID: {book.id.slice(0, 8)}…</p>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** 3. Financials & Credit Ledger Tab */
function FinancialsTab({ user }: { user: OpsUserDetail }) {
  return (
    <div className="space-y-5">
      {/* Credit Transactions */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Coins className="h-4 w-4" />
          Recent Credit Transactions ({user.transactions.length})
        </h4>
        {user.transactions.length > 0 ? (
          <Card className="divide-y divide-border text-xs">
            {user.transactions.map((tx) => (
              <div key={tx.id} className="p-3 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={tx.amount > 0 ? "success" : "neutral"}>
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} credits
                    </Badge>
                    <span className="font-medium text-foreground">{tx.type}</span>
                    {tx.reference && <span className="font-mono text-muted-foreground text-[11px]">{tx.reference}</span>}
                  </div>
                  {tx.description && <p className="text-muted-foreground text-[11px]">{tx.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-foreground font-semibold">{formatNumber(tx.balanceAfter)} balance</p>
                  <p className="text-[11px] text-muted-foreground">{timeAgo(tx.createdAt)}</p>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">No credit transactions recorded yet.</p>
        )}
      </div>

      {/* Payment History */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CreditCard className="h-4 w-4" />
          Payment Records ({user.payments.length})
        </h4>
        {user.payments.length > 0 ? (
          <Card className="divide-y divide-border text-xs">
            {user.payments.map((p) => (
              <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {(p.amountMinor / 100).toFixed(2)} {p.currency}
                    </span>
                    <Badge tone={p.status === "succeeded" ? "success" : p.status === "refunded" ? "danger" : "neutral"}>
                      {p.status}
                    </Badge>
                    {p.planName && <span className="text-muted-foreground">• {p.planName}</span>}
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Provider: {p.provider} • ID: {p.id.slice(0, 12)}…
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-success font-semibold">+{p.credits} credits</p>
                  <p className="text-[11px] text-muted-foreground">{timeAgo(p.createdAt)}</p>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">No purchases or payments made.</p>
        )}
      </div>
    </div>
  );
}

/** 4. Generation Jobs Tab */
function JobsTab({ user }: { user: OpsUserDetail }) {
  if (user.jobs.length === 0) {
    return <EmptyState icon={<FileClock className="h-6 w-6" />} title="No background jobs" description="This customer has not run any generation jobs yet." />;
  }

  return (
    <Card className="divide-y divide-border text-xs">
      {user.jobs.map((job) => (
        <div key={job.id} className="p-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-foreground">{job.type}</span>
              <Badge
                tone={
                  job.status === "completed"
                    ? "success"
                    : job.status === "running"
                    ? "primary"
                    : job.status === "failed"
                    ? "danger"
                    : "neutral"
                }
              >
                {job.status}
              </Badge>
              <span className="text-muted-foreground truncate max-w-xs">{job.bookTitle}</span>
            </div>
            <span className="text-muted-foreground text-[11px] shrink-0">{timeAgo(job.createdAt)}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-[11px]">
            <span>
              Progress: {job.progress} / {job.total || 100}% {job.model ? `• Model: ${job.model}` : ""}
            </span>
            <span>
              Credits: {job.creditsCharged} charged ({job.creditsReserved} reserved)
            </span>
          </div>

          {job.error && (
            <div className="rounded bg-danger-soft p-2 text-danger text-[11px] font-mono">
              {job.error}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

/** 5. Support & Audit History Tab */
function SupportAndAuditTab({ user }: { user: OpsUserDetail }) {
  return (
    <div className="space-y-5">
      {/* Support Requests */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <LifeBuoy className="h-4 w-4" />
          Support Requests ({user.supportRequests.length})
        </h4>
        {user.supportRequests.length > 0 ? (
          <Card className="divide-y divide-border text-xs">
            {user.supportRequests.map((req) => (
              <div key={req.id} className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{req.subject}</span>
                    <Badge tone={req.status === "answered" ? "success" : "warning"}>{req.status}</Badge>
                    <span className="text-muted-foreground text-[11px] uppercase font-mono">#{req.correlationId.slice(0, 8)}</span>
                  </div>
                  <span className="text-muted-foreground text-[11px] shrink-0">{timeAgo(req.createdAt)}</span>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">{req.message}</p>
                {req.response && (
                  <div className="rounded-lg border border-border bg-muted/40 p-2.5 space-y-1">
                    <p className="font-semibold text-[11px] text-foreground flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 text-success" /> Operator Response:
                    </p>
                    <p className="text-muted-foreground text-xs whitespace-pre-wrap">{req.response}</p>
                  </div>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">No support tickets submitted.</p>
        )}
      </div>

      {/* Audit Log Entries */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ScrollText className="h-4 w-4" />
          Administrative Audit Trail ({user.auditEntries.length})
        </h4>
        {user.auditEntries.length > 0 ? (
          <Card className="divide-y divide-border text-xs">
            {user.auditEntries.map((audit) => (
              <div key={audit.id} className="p-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{audit.action}</Badge>
                    <span className="font-medium text-foreground">{audit.reason}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    By: {audit.actorName || audit.actorEmail || audit.actorId || "System"} ({audit.actorRole || "operator"})
                  </p>
                </div>
                <span className="text-muted-foreground text-[11px] shrink-0">{timeAgo(audit.createdAt)}</span>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">No administrative interventions recorded for this customer.</p>
        )}
      </div>
    </div>
  );
}
