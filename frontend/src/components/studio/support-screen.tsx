"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  LifeBuoy,
  MessageSquarePlus,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import {
  useSubmitSupportRequest,
  useSupportRequests,
  type SupportCategory,
  type SupportRequestRow,
} from "@/lib/support-queries";
import { timeAgo } from "@/lib/utils";
/**
 * The Support Center.
 *
 * A customer asks a question or reports a problem here and reads the answer
 * when one arrives. Two things are stated on the screen rather than left
 * implied:
 *
 * - **Nothing is sent automatically.** The request is submitted when the
 *   customer presses the button, and the reference below it is the only way to
 *   find the request later.
 * - **No answer is invented.** A request with no response reads as unanswered,
 *   because the status and the reply both come from the server.
 */

const CATEGORIES: { value: SupportCategory; label: string; help: string }[] = [
  { value: "question", label: "Question", help: "How to use the product, or how something works." },
  { value: "bug", label: "Something is broken", help: "An error, a wrong result, or something that stopped working." },
  { value: "billing", label: "Billing", help: "A payment, a refund, credits, or a plan." },
  { value: "account", label: "Account", help: "Signing in, your email address, or your profile." },
  { value: "other", label: "Something else", help: "Anything the categories above do not cover." },
];

/** The tone of a request status badge. */
function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "answered" || status === "resolved" || status === "closed") return "success";
  if (status === "open" || status === "pending") return "warning";
  return "neutral";
}

/** The human label of a request status. */
function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

/**
 * The form that submits a request.
 *
 * The subject and message are validated against the same limits the API
 * enforces, so a request that would be refused is caught here first.
 */
function RequestForm({ onSubmitted }: { onSubmitted: (correlationId: string) => void }) {
  const submit = useSubmitSupportRequest();
  const [category, setCategory] = useState<SupportCategory>("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  const subjectError = subject.trim().length > 0 && subject.trim().length < 4
    ? "Give the subject at least four characters."
    : undefined;
  const messageError = message.trim().length > 0 && message.trim().length < 10
    ? "Describe the problem in at least ten characters."
    : undefined;
  const emailError = email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? "That does not look like an email address."
    : undefined;

  const valid = subject.trim().length >= 4 && message.trim().length >= 10 && !emailError;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;

    try {
      const result = await submit.mutateAsync({
        category,
        subject: subject.trim(),
        message: message.trim(),
        context: context.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSubject("");
      setMessage("");
      setContext("");
      setEmail("");
      setTouched(false);
      onSubmitted(result.correlationId ?? "");
    } catch {
      // The error is shown below the form; the text the customer wrote is kept
      // so they do not have to type it again.
    }
  };

  const selected = CATEGORIES.find((entry) => entry.value === category);

  return (
    <Card className="p-5 sm:p-6" data-testid="support-form">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="h-4.5 w-4.5 text-primary" aria-hidden />
        <h2 className="text-base font-semibold">Ask for help</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us what happened. Your request is not sent anywhere until you press send.
      </p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
        <Field label="What is this about?" htmlFor="support-category" hint={selected?.help}>
          <Select
            id="support-category"
            data-testid="support-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportCategory)}
          >
            {CATEGORIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Subject"
          htmlFor="support-subject"
          error={touched ? subjectError : undefined}
          hint={!subjectError ? "A short summary, so we can recognise it." : undefined}
        >
          <Input
            id="support-subject"
            data-testid="support-subject"
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="My export stopped at 60%"
            aria-invalid={touched && Boolean(subjectError)}
          />
        </Field>

        <Field
          label="What happened?"
          htmlFor="support-message"
          error={touched ? messageError : undefined}
          hint={!messageError ? "Include what you expected instead, if you can." : undefined}
        >
          <Textarea
            id="support-message"
            data-testid="support-message"
            value={message}
            maxLength={5000}
            rows={6}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="I started a PDF export and it has been queued for ten minutes without finishing…"
            aria-invalid={touched && Boolean(messageError)}
          />
        </Field>

        <Field
          label="Where did it happen?"
          htmlFor="support-context"
          hint="Optional. The screen or book you were on when it went wrong."
        >
          <Input
            id="support-context"
            data-testid="support-context"
            value={context}
            maxLength={500}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Export screen, book “Deep Work”"
          />
        </Field>

        <Field
          label="Email for the reply"
          htmlFor="support-email"
          error={touched ? emailError : undefined}
          hint={!emailError ? "Optional. We reply inside the product by default." : undefined}
        >
          <Input
            id="support-email"
            data-testid="support-email"
            type="email"
            value={email}
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-invalid={touched && Boolean(emailError)}
          />
        </Field>

        {submit.isError ? (
          <Alert tone="danger" data-testid="support-error">
            {errorMessage(submit.error)}
          </Alert>
        ) : null}

        <Button type="submit" loading={submit.isPending} data-testid="support-submit">
          <Send className="h-4 w-4" aria-hidden />
          Send request
        </Button>
      </form>
    </Card>
  );
}

/** One request, with the answer when there is one. */
function RequestCard({ request }: { request: SupportRequestRow }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(request.correlationId);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const categoryLabel = CATEGORIES.find((entry) => entry.value === request.category)?.label ?? request.category;

  return (
    <Card className="p-5" data-testid={`support-request-${request.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{request.subject}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {categoryLabel} · {timeAgo(request.createdAt)}
          </p>
        </div>
        <Badge tone={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
      </div>

      {request.response ? (
        <div className="mt-4 rounded-xl border border-success/20 bg-success-soft/50 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Our reply
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{request.response}</p>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          No reply yet. We answer every request.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Support reference:</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{request.correlationId}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyReference()}
          data-testid={`copy-reference-${request.id}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </Button>
        {failed ? (
          <span className="text-xs text-danger">Copy the reference above instead.</span>
        ) : null}
      </div>
    </Card>
  );
}

/** The Support Center screen. */
export function SupportCenter() {
  const requests = useSupportRequests();
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const rows = useMemo(() => requests.data ?? [], [requests.data]);
  const open = useMemo(() => rows.filter((row) => row.status === "open" || row.status === "pending"), [rows]);
  const answered = useMemo(() => rows.filter((row) => row.status !== "open" && row.status !== "pending"), [rows]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="Support Center"
        description="Ask a question, report a problem, or check on a request you have already sent."
      />

      {submittedReference ? (
        <Alert tone="success" data-testid="support-receipt">
          Your request was sent. Keep this reference: <span className="font-mono">{submittedReference}</span>. We
          answer here, and you can quote the reference if you follow up.
        </Alert>
      ) : null}

      <RequestForm onSubmitted={setSubmittedReference} />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Your requests</h2>

        {requests.isLoading ? (
          <PageLoader label="Loading your requests…" />
        ) : requests.isError ? (
          <ErrorState
            message={errorMessage(requests.error)}
            onRetry={() => void requests.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-6 w-6" aria-hidden />}
            title="No requests yet"
            description="When you ask for help, your request and any reply from us will appear here."
          />
        ) : (
          <div className="space-y-5">
            {open.length > 0 ? (
              <section aria-labelledby="support-open-heading" className="space-y-3">
                <h3 id="support-open-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                  Waiting for an answer ({open.length})
                </h3>
                {open.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </section>
            ) : null}

            {answered.length > 0 ? (
              <section aria-labelledby="support-answered-heading" className="space-y-3">
                <h3 id="support-answered-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                  Answered ({answered.length})
                </h3>
                {answered.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
