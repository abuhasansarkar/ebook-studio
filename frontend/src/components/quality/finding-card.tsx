"use client";

import Link from 'next/link';
import { useState } from 'react';
import { CATEGORY_LABELS } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { Badge } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import type { Finding } from './quality-types';

const SEVERITY = { error: { tone: 'danger', label: 'Must fix' }, warning: { tone: 'warning', label: 'Should fix' }, info: { tone: 'neutral', label: 'Consider' } } as const;
const METHOD = { rule: 'Rule check', heuristic: 'Pattern match — may be a false alarm', ai: 'AI suggestion' } as const;

export function FindingCard({ finding, bookId, dir, lang, stale, onChanged }: { finding: Finding; bookId: string; dir: 'ltr' | 'rtl'; lang: string; stale: boolean; onChanged: () => void }) {
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const severity = SEVERITY[finding.severity];
  const missing = finding.location?.status === 'missing' || finding.chapterRemoved;
  async function review(status: 'open' | 'resolved' | 'dismissed', text = '') {
    setBusy(true); setError('');
    try { await api.patch(`/quality/findings/${finding.id}`, { status, note: text }); setDismissing(false); setNote(''); onChanged(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const carried = finding.reviewedAt && new Date(finding.reviewedAt) < new Date(finding.createdAt);
  return <article className="rounded-2xl border border-border bg-surface p-4" aria-labelledby={`finding-${finding.id}`}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={severity.tone}>{severity.label}</Badge>
      <Badge>{CATEGORY_LABELS[finding.category]}</Badge>
      <span className="text-muted-foreground">{METHOD[finding.method]}</span>
      {finding.chapter && <span className="text-muted-foreground">· Chapter {finding.chapter.position + 1}: <span lang={lang} dir={dir}>{finding.chapter.title}</span></span>}
      {finding.status !== 'open' && <Badge tone={finding.status === 'resolved' ? 'success' : 'neutral'}>{finding.status === 'resolved' ? 'Resolved' : 'Dismissed'}</Badge>}
    </div>
    <p id={`finding-${finding.id}`} className="mt-2 text-sm font-medium">{finding.message}</p>
    {finding.anchor ? <blockquote lang={lang} dir={dir} className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      {finding.anchor.prefix && <span>…{finding.anchor.prefix}</span>}<mark className="rounded bg-warning-soft px-0.5 text-foreground">{finding.anchor.quote}</mark>{finding.anchor.suffix && <span>{finding.anchor.suffix}…</span>}
    </blockquote> : finding.evidence && <p lang={lang} dir={dir} className="mt-2 text-sm text-muted-foreground">{finding.evidence}</p>}
    {finding.anchor && finding.evidence && finding.evidence !== finding.anchor.quote && <p className="mt-1 text-xs text-muted-foreground">{finding.evidence}</p>}
    {finding.suggestion?.replacement && <p className="mt-2 text-sm">Suggested change: <span className="line-through">{finding.anchor?.quote}</span> → <strong lang={lang}>{finding.suggestion.replacement}</strong> <span className="text-xs text-muted-foreground">(applied only when you choose it in the editor)</span></p>}
    {finding.suggestion?.advice && <p className="mt-2 text-sm"><span className="font-medium">Suggestion:</span> {finding.suggestion.advice}</p>}
    {finding.chapterRemoved ? <p className="mt-2 text-xs text-warning">This chapter has been removed.</p>
      : finding.location?.status === 'missing' ? <p className="mt-2 text-xs text-warning">This text has changed or been removed since the review, so it cannot be highlighted. Run the checks again to see whether the issue remains.</p>
      : finding.location?.status === 'moved' ? <p className="mt-2 text-xs text-muted-foreground">The text has moved since the review; the editor will find it.</p>
      : stale && finding.location ? <p className="mt-2 text-xs text-muted-foreground">The passage is unchanged, but the book has changed since this report.</p> : null}
    {finding.needsHumanReview && <p className="mt-2 text-xs text-muted-foreground">Needs human review: eBookStudio does not verify facts or sources.</p>}
    {finding.status !== 'open' && <p className="mt-2 text-xs text-muted-foreground">{finding.status === 'resolved' ? 'Resolved' : 'Dismissed'}{finding.reviewedByName ? ` by ${finding.reviewedByName}` : ''}{finding.reviewedAt ? ` ${timeAgo(finding.reviewedAt)}` : ''}{carried ? ' (carried over from an earlier report)' : ''}{finding.reviewNote ? `: “${finding.reviewNote}”` : ''}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    {dismissing && <div className="mt-3 space-y-2">
      <label htmlFor={`note-${finding.id}`} className="text-xs font-medium">Why is this not a problem? <span className="font-normal text-muted-foreground">(required, kept with the finding)</span></label>
      <Textarea id={`note-${finding.id}`} className="min-h-16" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy || note.trim().length < 3} onClick={() => void review('dismissed', note)}>Dismiss finding</Button><Button size="sm" variant="ghost" onClick={() => setDismissing(false)}>Cancel</Button></div>
    </div>}
    <div className="mt-3 flex flex-wrap gap-2">
      {finding.chapterId && !finding.chapterRemoved && <Link className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={`/app/books/${bookId}/editor?chapter=${finding.chapterId}${missing ? '' : `&finding=${finding.id}`}`}>{missing ? 'Open chapter' : 'Show in editor'}</Link>}
      {finding.status === 'open' ? <>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void review('resolved', 'Fixed in the manuscript.')}>Mark resolved</Button>
        {!dismissing && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDismissing(true)}>Dismiss…</Button>}
      </> : <Button size="sm" variant="ghost" disabled={busy} onClick={() => void review('open')}>Reopen</Button>}
    </div>
  </article>;
}
