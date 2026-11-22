"use client";

import { useState } from "react";
import { Alert, Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { Field, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useOpsPayments, useRefundPayment } from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/** The payment list, with refunds. */
export function PaymentsPanel() {
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
