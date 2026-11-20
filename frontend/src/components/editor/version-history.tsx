"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, ErrorState, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import type { SavedChapter } from "./use-autosave";

type RevisionMeta = { id: string; version: number; title: string; wordCount: number; savedAt: string };
export type Revision = RevisionMeta & { contentJson: Record<string, unknown> | null };

// Render the stored document as plain text, never as untrusted HTML.
function previewText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; type?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  const text = Array.isArray(n.content) ? n.content.map(previewText).join("") : "";
  return text + (["paragraph", "heading", "listItem", "tableRow", "hardBreak"].includes(n.type ?? "") ? "\n" : "");
}

export function VersionHistory({ chapterId, currentVersion, onClose, onRestored }: {
  chapterId: string;
  currentVersion: number;
  onClose: () => void;
  onRestored: (saved: SavedChapter, revision: Revision) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: ["chapter-versions", chapterId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => api.get<{ versions: RevisionMeta[]; nextBefore: number | null }>(`/chapters/${chapterId}/versions${pageParam !== undefined ? `?before=${pageParam}` : ""}`),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    staleTime: 0,
  });
  const revision = useQuery({
    queryKey: ["chapter-version", chapterId, selectedId],
    queryFn: () => api.get<{ revision: Revision }>(`/chapters/${chapterId}/versions/${selectedId}`).then((r) => r.revision),
    enabled: Boolean(selectedId),
  });
  const restore = useMutation({
    mutationFn: (r: Revision) => api.post<{ chapter: SavedChapter }>(`/chapters/${chapterId}/versions/${r.id}/restore`, { version: currentVersion }),
    onSuccess: (result, r) => onRestored(result.chapter, r),
  });
  const versions = history.data?.pages.flatMap((p) => p.versions) ?? [];

  return (
    <Dialog open onClose={() => !restore.isPending && onClose()} title="Version history" description="Preview an earlier draft before restoring it. Your current draft will also be kept in history." className="max-w-3xl">
      {history.isPending ? <div className="flex justify-center p-8"><Spinner /></div> : history.error ? <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} /> : versions.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No earlier drafts yet. History is saved when you edit this chapter.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div className="max-h-80 space-y-2 overflow-y-auto" aria-label="Saved revisions">
            {versions.map((r) => (
              <button key={r.id} type="button" disabled={restore.isPending} aria-pressed={selectedId === r.id} onClick={() => { setSelectedId(r.id); restore.reset(); }} className={`w-full cursor-pointer rounded-lg border p-3 text-start text-sm ${selectedId === r.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"}`}>
                <span className="block font-semibold">Version {r.version}</span>
                <span className="block text-xs text-muted-foreground">{new Date(r.savedAt).toLocaleString()}</span>
                <span className="block text-xs text-muted-foreground">{r.wordCount.toLocaleString()} words</span>
              </button>
            ))}
            {history.hasNextPage && <Button variant="secondary" size="sm" disabled={history.isFetchingNextPage || restore.isPending} onClick={() => void history.fetchNextPage()}>Load older drafts</Button>}
          </div>
          <div className="min-w-0">
            {!selectedId ? <p className="text-sm text-muted-foreground">Select a version to preview.</p> : revision.isPending ? <Spinner /> : revision.error ? <ErrorState message={errorMessage(revision.error)} onRetry={() => void revision.refetch()} /> : revision.data && (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border p-4">
                <h3 className="mb-3 font-semibold" dir="auto">{revision.data.title}</h3>
                <p className="whitespace-pre-wrap text-sm" dir="auto">{previewText(revision.data.contentJson) || "Empty chapter"}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {restore.error && <Alert tone="danger" className="mt-4">{errorMessage(restore.error)}</Alert>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={restore.isPending} onClick={onClose}>Close</Button>
        <Button disabled={!revision.data || restore.isPending} onClick={() => revision.data && restore.mutate(revision.data)}>{restore.isPending ? "Restoring…" : "Restore this version"}</Button>
      </div>
    </Dialog>
  );
}
