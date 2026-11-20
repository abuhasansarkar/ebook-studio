"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MARKETPLACES, MARKETPLACE_LABELS, type Marketplace, type PublishingReport } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, ErrorState } from '@/components/ui/misc';

export function PublishingChecks({ bookId }: { bookId: string }) {
  const [destination, setDestination] = useState<Marketplace>('kdp_ebook');
  const query = useQuery({
    queryKey: ['publishing-checks', bookId, destination],
    queryFn: async () => (await api.get<{ report: PublishingReport }>(`/books/${bookId}/publishing-checks?destination=${destination}`)).report,
    staleTime: 0,
  });
  return <Card className="mt-6 p-6">
    <h3 className="font-semibold">Prepare for a marketplace</h3>
    <p className="mt-1 text-sm text-muted-foreground">Check the destination before preparing your sale edition. Publishing and final review happen in your seller account.</p>
    <div className="my-4 flex flex-wrap items-center gap-3">
      <label className="text-sm">Destination <select aria-label="Publishing destination" className="ml-2 rounded border border-border bg-surface p-2" value={destination} onChange={e => setDestination(e.target.value as Marketplace)}>
        {MARKETPLACES.map(m => <option value={m} key={m}>{MARKETPLACE_LABELS[m]}</option>)}
      </select></label>
      <Button size="sm" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh checks</Button>
      <Button size="sm" variant="secondary" disabled={!query.data || query.isFetching} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(query.data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `${destination}-publishing-review.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download checklist</Button>
    </div>
    {query.isLoading ? <p role="status">Checking manuscript…</p> : query.error ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} /> : query.data && <>
      <p className="mb-3 text-sm font-semibold">{query.data.status === 'blocked' ? 'Preparation needed' : 'Human review required'}</p>
      <ul className="space-y-2 text-sm">{query.data.checks.map(check => <li key={check.id}>
        <span className={check.status === 'pass' ? 'font-semibold text-success' : 'font-semibold text-warning'}>{check.status === 'pass' ? 'Passed' : check.status === 'blocker' ? 'Required' : 'Review'}: </span>
        {check.message} {check.source && <a className="underline" href={check.source} target="_blank" rel="noopener noreferrer">Official guidance</a>}
      </li>)}</ul>
      <p className="mt-4 text-xs text-muted-foreground">Rules checked 20 November 2026. Refresh after editing or exporting. This checklist does not certify marketplace acceptance.</p>
    </>}
  </Card>;
}
