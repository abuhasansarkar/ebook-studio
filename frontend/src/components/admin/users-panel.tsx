"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { Alert, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useCreditAdjustment, useOpsUsers } from "@/lib/studio-queries";
import { formatNumber } from "@/lib/utils";

/** The customer list, with credit adjustments. */
export function UsersPanel() {
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
