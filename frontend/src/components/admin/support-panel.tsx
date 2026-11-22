"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useSupportReply, useSupportRequests } from "@/lib/studio-queries";
import { timeAgo } from "@/lib/utils";

/** The support queue. */
export function SupportPanel() {
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
