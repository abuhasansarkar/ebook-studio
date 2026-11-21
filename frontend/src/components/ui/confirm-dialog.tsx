"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * A confirmation dialog for an action that cannot be undone.
 *
 * The browser's own `window.confirm` is not used here: it cannot be styled, it
 * cannot show what exactly is about to happen, and it blocks the page without
 * saying why. This dialog states the consequence, names the thing being acted
 * on, and puts the destructive action behind an explicit choice.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  /** Holds the confirm button back until the dialog's own input is complete. */
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={busy ? () => undefined : onClose} title={title} description={description}>
      <div className="space-y-4">
        {tone === "danger" && (
          <div className="flex gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger" aria-hidden />
            <div className="text-sm text-danger">{children}</div>
          </div>
        )}
        {tone !== "danger" && children && <div className="text-sm text-muted-foreground">{children}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
