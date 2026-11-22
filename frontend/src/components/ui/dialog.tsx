"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible modal built on the native <dialog> element.
 *
 * The native element does the focus trapping and makes the rest of the page
 * inert, which is why there is no focus-trap library here. What it does not
 * do is give the dialog an accessible name or description, and it does not
 * restore focus if the trigger is gone by the time the dialog closes — so both
 * are handled here.
 *
 * `dismissable={false}` is for dialogs that demand a choice (for example an
 * edit conflict): the close button is hidden and Escape / backdrop clicks are
 * ignored, so the only way out is one of the dialog's own actions.
 */
export function Dialog({ open, onClose, title, description, children, className, dismissable = true }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string; dismissable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // A unique id per instance: two dialogs on one page would otherwise share
  // the same id, and the second one's aria-labelledby would point at the first.
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Escape closes the native dialog, which fires `cancel` before `close`.
  // React's `open` prop has to follow, or the dialog and the state disagree:
  // the element is closed on screen while the component still believes it is
  // open, and the next render cannot reopen it.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handleCancel = (event: Event) => {
      // Stop the native close so there is exactly one path out of the dialog.
      event.preventDefault();
      if (dismissable) onClose();
    };
    d.addEventListener("cancel", handleCancel);
    return () => d.removeEventListener("cancel", handleCancel);
  }, [onClose, dismissable]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => dismissable && e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] max-w-lg font-sans rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40", className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {dismissable && (
              <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
