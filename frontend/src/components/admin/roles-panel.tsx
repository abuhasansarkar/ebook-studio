"use client";

import { useState } from "react";
import { Alert, Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useOpsUsers, useRoleChange, useRoleHolders } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/** The role holders, with grant and revoke. */
const ROLE_SUMMARIES: Record<string, string> = {
  support: "Reads operational views, manages accounts and answers support requests. Cannot move money.",
  finance: "Reads billing, issues refunds and adjusts credits. Cannot change roles.",
  administrator: "Every permission, including granting and revoking roles.",
};

/** Who holds an operator role, with grant and revoke. */
export function RolesPanel() {
  const roles = useRoleHolders();
  const change = useRoleChange();
  const [problem, setProblem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  const [role, setRole] = useState("support");
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState<{ userId: string; name: string; role: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const results = useOpsUsers(query || undefined, query.length >= 2 && !target);

  if (roles.isLoading) return <PageLoader />;
  if (roles.error) return <ErrorState message={errorMessage(roles.error)} onRetry={() => void roles.refetch()} />;

  const holders = roles.data?.holders ?? [];
  const available = roles.data?.roles ?? [];
  const alreadyHolds = target ? holders.some((h) => h.userId === target.id && h.role === role) : false;

  const grant = () => {
    if (!target) return;
    setProblem(null);
    change.mutate(
      { userId: target.id, role, reason: reason.trim(), action: "grant" },
      {
        onSuccess: () => {
          setTarget(null);
          setSearch("");
          setQuery("");
          setReason("");
          void roles.refetch();
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  const revoke = () => {
    if (!revoking) return;
    setProblem(null);
    change.mutate(
      { userId: revoking.userId, role: revoking.role, reason: revokeReason.trim(), action: "revoke" },
      {
        onSuccess: () => {
          setRevoking(null);
          setRevokeReason("");
          void roles.refetch();
        },
        onError: (err) => {
          setRevoking(null);
          setProblem(errorMessage(err));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {problem && <Alert tone="danger">{problem}</Alert>}

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Grant a role</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Every grant is recorded in the audit trail with its reason.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {target ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3" data-testid="role-target">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{target.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{target.email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <Field label="Customer" htmlFor="role-user-search" hint="Search by name or email.">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(search.trim());
                  }}
                  className="flex gap-2"
                >
                  <Input
                    id="role-user-search"
                    className="bg-background"
                    placeholder="name@example.com"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    data-testid="role-user-search"
                  />
                  <Button type="submit" variant="secondary" disabled={search.trim().length < 2} loading={results.isFetching}>
                    Search
                  </Button>
                </form>
              </Field>
            )}
            {!target && query.length >= 2 && results.data && (
              <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label="Matching customers">
                {results.data.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No customer matches “{query}”.</li>}
                {results.data.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-muted"
                      onClick={() => setTarget({ id: user.id, name: user.name, email: user.email })}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                      </span>
                      {user.roles.length > 0 && <Badge tone="primary">{user.roles.join(", ")}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!target && results.error && <p className="mt-2 text-sm text-danger">{errorMessage(results.error)}</p>}
          </div>
          <Field label="Role" htmlFor="role-select" hint={ROLE_SUMMARIES[role]} className="sm:col-span-2">
            <Select id="role-select" className="bg-background" value={role} onChange={(event) => setRole(event.target.value)} data-testid="role-select">
              {available.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="role-reason" hint={`At least ten characters · ${reason.trim().length}/10`} className="sm:col-span-2">
            <Textarea
              id="role-reason"
              className="min-h-[80px] bg-background"
              placeholder="e.g. Joining the support rota from Monday."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-testid="role-reason"
            />
          </Field>
        </div>
        {alreadyHolds && <p className="mt-3 text-sm text-muted-foreground">{target?.name} already holds this role.</p>}
        <Button className="mt-4" loading={change.isPending && !revoking} disabled={!target || alreadyHolds || reason.trim().length < 10} onClick={grant} data-testid="grant-role">
          Grant role
        </Button>
      </Card>

      <Card className="divide-y divide-border">
        <div className="px-5 py-3.5">
          <h3 className="text-sm font-semibold">Current operators</h3>
          <p className="text-xs text-muted-foreground">{holders.length === 1 ? "1 role held" : `${holders.length} roles held`}</p>
        </div>
        {holders.map((holder) => (
          <div key={holder.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{holder.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{holder.user.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Granted {timeAgo(holder.grantedAt)} · {holder.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="primary">{holder.role}</Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                onClick={() => {
                  setRevokeReason("");
                  setRevoking({ userId: holder.userId, name: holder.user.name, role: holder.role });
                }}
              >
                Revoke
              </Button>
            </div>
          </div>
        ))}
        {holders.length === 0 && <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nobody holds an operator role yet.</p>}
      </Card>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        title={`Revoke ${revoking?.role ?? ""} from ${revoking?.name ?? ""}?`}
        description="They lose the role's permissions immediately. The reason is recorded in the audit trail."
        confirmLabel="Revoke role"
        tone="primary"
        busy={change.isPending}
        confirmDisabled={revokeReason.trim().length < 10}
      >
        <Field label="Reason" htmlFor="revoke-reason" hint={`At least ten characters · ${revokeReason.trim().length}/10`}>
          <Textarea id="revoke-reason" className="min-h-[80px] bg-background" placeholder="e.g. Moved to another team." value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
