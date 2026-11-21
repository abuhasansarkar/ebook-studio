"use client";
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { OutlineRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, ErrorState } from '@/components/ui/misc';
export function OutlineHistory({ bookId, currentVersion, disabled, onRestored }: { bookId: string; currentVersion: number; disabled: boolean; onRestored: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = useQuery({ queryKey: ['outline-history', bookId, before], enabled: open, queryFn: () => api.get<{ versions: Pick<OutlineRecord, 'id' | 'version' | 'approvedAt'>[]; nextBefore: number | null }>(`/books/${bookId}/outlines${before ? `?before=${before}` : ''}`) });
  const preview = useQuery({ queryKey: ['outline-revision', bookId, selected], enabled: open && selected !== null, queryFn: () => api.get<{ outline: OutlineRecord }>(`/books/${bookId}/outlines/${selected}`) });
  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => { setOpen(true); setSelected(null); setBefore(null); }}>Outline history</Button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} title="Outline history" description={`Current planning version: ${currentVersion}. Restoring creates a new unapproved plan and keeps all manuscript chapters unchanged.`}>
      {versions.isPending ? <p role="status" className="my-3 text-sm text-muted-foreground">Loading versions…</p> : versions.error ? <ErrorState message={errorMessage(versions.error)} onRetry={() => void versions.refetch()} /> : !versions.data?.versions.length ? <p className="my-3 text-sm text-muted-foreground">No earlier versions yet. Each time the outline is saved or regenerated, a version is kept here.</p> : <div className="my-3 flex flex-wrap gap-2">{versions.data?.versions.map(v => <Button key={v.id} variant={selected === v.version ? 'primary' : 'secondary'} size="sm" onClick={() => setSelected(v.version)}>Version {v.version}{v.approvedAt ? ' · approved' : ''}</Button>)}</div>}
      <div className="mb-4 flex gap-2"><Button size="sm" variant="ghost" disabled={!before} onClick={() => setBefore(null)}>Latest versions</Button><Button size="sm" variant="ghost" disabled={!versions.data?.nextBefore} onClick={() => setBefore(versions.data!.nextBefore)}>Older versions</Button></div>
      {preview.isFetching && <p role="status">Loading outline…</p>}
      {preview.error && <ErrorState message={errorMessage(preview.error)} onRetry={() => void preview.refetch()} />}
      {selected === null && !!versions.data?.versions.length && <p className="text-sm text-muted-foreground">Choose a version to preview it.</p>}
      {preview.data && !preview.isFetching && <div className="space-y-3">
        <h3 className="font-semibold">{preview.data.outline.data.title}</h3><p>{preview.data.outline.data.subtitle}</p>
        <ol className="max-h-72 list-decimal space-y-2 overflow-y-auto pl-5">{preview.data.outline.data.chapters.map((c, i) => <li key={i}><strong>{c.title}</strong><p className="text-sm">{c.goal}</p><p className="text-xs">{c.targetWords} target words · {c.keyPoints.join(' / ')}</p></li>)}</ol>
        <Alert tone="info">This restores planning only. Written chapters, chapter order, text, revision history and book title are preserved. Structural approval is blocked when manuscript edits exist.</Alert>
        <Button disabled={busy || selected === currentVersion} onClick={async () => {
          setBusy(true);
          try {
            await api.post(`/books/${bookId}/outlines/${selected}/restore`, { baseVersion: currentVersion });
            await Promise.all([qc.invalidateQueries({ queryKey: ['book', bookId] }), qc.invalidateQueries({ queryKey: ['outline-history', bookId] })]);
            onRestored(); setOpen(false); toast.success('Planning restored; manuscript preserved');
          } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>Restore this outline</Button>
      </div>}
    </Dialog>
  </>;
}
