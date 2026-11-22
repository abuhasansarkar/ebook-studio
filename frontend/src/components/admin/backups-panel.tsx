"use client";

import { useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { Alert, Badge, Card, ErrorState, PageLoader } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useBackups, useCreateBackup, useDeleteBackup, useRehearseRestore } from "@/lib/studio-queries";
import { formatNumber, timeAgo } from "@/lib/utils";

/** The backups, with restore rehearsals. */
export function BackupsPanel() {
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
