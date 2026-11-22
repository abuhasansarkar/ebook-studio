import { AlertTriangle, Loader2 } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary-hover",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof badgeTones; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}>{children}</span>;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-primary", className)} aria-label={label} />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="status" suppressHydrationWarning>
      <Spinner className="h-7 w-7" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger-soft/50 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-danger" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-5 cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-muted">
          Try again
        </button>
      )}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({ tone = "warning", children, className }: { tone?: "warning" | "danger" | "success" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    warning: "border-warning/25 bg-warning-soft text-[#7a5408]",
    danger: "border-danger/25 bg-danger-soft text-danger",
    success: "border-success/25 bg-success-soft text-success",
    info: "border-primary/20 bg-primary-soft text-primary-hover",
  };
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

/**
 * A titled block of content.
 *
 * Screens here are a list of sections, and each one says what it is. The
 * heading level is a parameter because a section is not always the first thing
 * on the page, and a heading that skips a level breaks the outline a screen
 * reader reads.
 */
export function Section({ title, description, actions, headingLevel = 2, className, children }: { title: string; description?: ReactNode; actions?: ReactNode; headingLevel?: 2 | 3 | 4; className?: string; children: ReactNode }) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading className="text-lg font-semibold">{title}</Heading>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A label and a value, on one row.
 *
 * A definition list is used rather than a table, because these are terms and
 * their definitions rather than tabular data, and a screen reader announces a
 * definition list correctly.
 */
export function DetailRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3.5", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * A definition list of label-and-value rows.
 *
 * The rows are divided by a hairline so a long list can be scanned, and the
 * whole thing is one card so it reads as a single piece of information.
 */
export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {children}
    </dl>
  );
}

/**
 * A labelled status, as a coloured pill.
 *
 * The tone is passed in rather than derived, because the caller knows what the
 * status means; deriving it here would need a lookup table of every status in
 * the product.
 */
export function StatusDot({ tone = "neutral", label }: { tone?: "neutral" | "primary" | "success" | "warning" | "danger"; label: string }) {
  const dots = {
    neutral: "bg-muted-foreground",
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  } as const;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dots[tone])} aria-hidden />
      {label}
    </span>
  );
}
