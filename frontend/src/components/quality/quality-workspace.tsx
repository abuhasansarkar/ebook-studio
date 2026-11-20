"use client";

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_LABELS, QUALITY_CATEGORIES, bookContextSchema, getLanguage, type QualityCategory } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { operationRequest } from '@/lib/operation-request';
import { qk, useBook } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageLoader, Progress } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import { FindingCard } from './finding-card';
import type { ContextState, Finding, QualityConfig, QualityReport } from './quality-types';

type Group = 'defects' | 'ai' | 'human';
const GROUPS: [Group, string, string][] = [
  ['defects', 'Defects', 'Found by deterministic rules.'],
  ['ai', 'AI suggestions', 'Model suggestions with verified quotes. Judge each one yourself.'],
  ['human', 'Needs human review', 'Factual, statistical and citation concerns. Nothing here is verified for accuracy.'],
];
const groupOf = (f: Finding): Group => f.needsHumanReview ? 'human' : f.method === 'ai' ? 'ai' : 'defects';
/** Findings rendered per group before "Show more"; long reports stay usable. */
const PAGE = 50;
const RANK = { error: 0, warning: 1, info: 2 } as const;
const active = (r?: QualityReport | null) => !!r && ['queued', 'running'].includes(r.status);

export function QualityWorkspace({ bookId }: { bookId: string }) {
  const qc = useQueryClient();
  const book = useBook(bookId);
  const reports = useQuery({ queryKey: ['quality-reports', bookId], queryFn: () => api.get<{ reports: QualityReport[] }>(`/books/${bookId}/quality/reports`).then(r => r.reports), refetchInterval: q => q.state.data?.some(active) ? 1500 : false });
  const [selected, setSelected] = useState<string | null>(null);
  const reportId = selected ?? reports.data?.[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['quality-report', bookId, reportId], enabled: !!reportId, queryFn: () => api.get<{ report: QualityReport; findings: Finding[] }>(`/books/${bookId}/quality/reports/${reportId}`), refetchInterval: q => active(q.state.data?.report) ? 1500 : false });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['quality-reports', bookId] }); void qc.invalidateQueries({ queryKey: ['quality-report', bookId] }); };

  async function runChecks() {
    setRunning(true); setError(''); setNotice('');
    try {
      const r = await api.post<{ reportId: string; reused: boolean }>(`/books/${bookId}/quality/reports`, {});
      setSelected(r.reportId); refresh();
      setNotice(r.reused ? 'Nothing changed since the latest checks, so that report is shown.' : 'Checks finished.');
    } catch (e) { setError(errorMessage(e)); } finally { setRunning(false); }
  }

  if (book.isLoading || reports.isLoading) return <PageLoader label="Loading quality review…" />;
  if (book.error || reports.error || !book.data) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(book.error ?? reports.error)} onRetry={() => { void book.refetch(); void reports.refetch(); }} /></div>;
  const lang = getLanguage(book.data.language);
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold">Quality review</h2>
        <p className="mt-1 text-sm text-muted-foreground">Find concrete problems and jump to them in the editor. Reviews never change your manuscript: every fix is your own edit, saved with normal version history. There is no overall quality score, and passing these checks does not certify accuracy, originality or marketplace acceptance.</p>
      </div>
      <Button loading={running} onClick={() => void runChecks()}>Run checks (free)</Button>
    </div>
    {error && <Alert tone="danger">{error}</Alert>}
    {notice && <Alert tone="success">{notice}</Alert>}
    <AiReviewPanel bookId={bookId} chapters={book.data.chapters.filter(c => c.wordCount > 0)} busy={reports.data?.some(active) ?? false} onStarted={id => { setSelected(id); refresh(); }} />
    {!reports.data?.length ? <EmptyState icon={<span aria-hidden>✓</span>} title="No reviews yet" description="Run the free checks to find empty chapters, placeholders, broken images, heading problems, repeated passages and claims that need sources." />
      : <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="report-select" className="mb-0">Report</Label>
          <Select id="report-select" className="h-9 w-auto min-w-64" value={reportId ?? ''} onChange={e => setSelected(e.target.value)}>
            {reports.data.map(r => <option key={r.id} value={r.id}>{r.kind === 'ai' ? 'AI review' : 'Checks'} · {new Date(r.createdAt).toLocaleString()}{r.stale ? ' · out of date' : ''}{r.status !== 'completed' ? ` · ${r.status}` : ''}</option>)}
          </Select>
        </div>
        {detail.error ? <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          : !detail.data ? <PageLoader label="Opening report…" />
          : <ReportView key={detail.data.report.id} bookId={bookId} report={detail.data.report} findings={detail.data.findings} lang={lang.code} dir={lang.dir} chapters={book.data.chapters} onChanged={refresh} onRerun={() => void runChecks()} rerunning={running} />}
      </div>}
    <ContextEditor bookId={bookId} onSaved={refresh} />
  </div>;
}

function AiReviewPanel({ bookId, chapters, busy, onStarted }: { bookId: string; chapters: { id: string; title: string; position: number }[]; busy: boolean; onStarted: (reportId: string) => void }) {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['quality-config'], queryFn: () => api.get<QualityConfig>('/quality/config') });
  const [chosen, setChosen] = useState<string[] | null>(null);
  const ids = chosen ?? chapters.map(c => c.id);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const cost = config.data ? ids.length * config.data.creditsPerChapter : 0;
  async function start() {
    setState({ busy: true, error: '' });
    try {
      const r = await operationRequest<{ report: { id: string } }>(`/books/${bookId}/quality/ai-reviews`, { chapterIds: ids, expectedCredits: cost });
      onStarted(r.report.id); void qc.invalidateQueries({ queryKey: qk.credits });
      setState({ busy: false, error: '' });
    } catch (e) { setState({ busy: false, error: errorMessage(e) }); }
  }
  return <details className="rounded-2xl border border-border bg-surface p-4">
    <summary className="cursor-pointer text-sm font-semibold">AI review (optional, uses credits)</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-muted-foreground">An AI editor reviews each selected chapter for clarity, repetition, terminology conflicts and claims that need sources. Suggestions are kept only when they quote your text exactly. It can miss problems and can be wrong. {config.data ? `${config.data.creditsPerChapter} credits per chapter, charged only for chapters actually reviewed. ${config.data.mock ? 'Mock mode: suggestions are test data.' : `Model: ${config.data.model}.`}` : 'Loading pricing…'}</p>
      {config.data && !config.data.enabled && <Alert tone="warning">AI review is not configured on this server.</Alert>}
      {!chapters.length ? <p className="text-muted-foreground">Write a chapter first.</p> : <fieldset className="grid gap-1 sm:grid-cols-2"><legend className="mb-1 font-medium">Chapters to review</legend>
        {chapters.map(c => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={ids.includes(c.id)} onChange={e => setChosen(e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />{c.position + 1}. {c.title}</label>)}
      </fieldset>}
      <p>Estimated cost: <strong>{cost} credits</strong> for {ids.length} chapter{ids.length === 1 ? '' : 's'}. Chapters you edit after starting are skipped and not charged.</p>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button disabled={!config.data?.enabled || !ids.length || busy || state.busy} loading={state.busy} onClick={() => void start()}>Start AI review · {cost} credits</Button>
      {busy && <p className="text-xs text-muted-foreground">A review is already running for this book.</p>}
    </div>
  </details>;
}

function ReportView({ bookId, report, findings, lang, dir, chapters, onChanged, onRerun, rerunning }: { bookId: string; report: QualityReport; findings: Finding[]; lang: string; dir: 'ltr' | 'rtl'; chapters: { id: string; title: string; position: number }[]; onChanged: () => void; onRerun: () => void; rerunning: boolean }) {
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState<QualityCategory | ''>('');
  const [chapter, setChapter] = useState('');
  const [status, setStatus] = useState('open');
  const [cancelling, setCancelling] = useState(false);
  const [limits, setLimits] = useState<Record<Group, number>>({ defects: PAGE, ai: PAGE, human: PAGE });
  // Most severe first, then book order.
  const shown = useMemo(() => findings.filter(f => (!severity || f.severity === severity) && (!category || f.category === category) && (!chapter || f.chapterId === chapter) && (!status || f.status === status))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.chapter?.position ?? -1) - (b.chapter?.position ?? -1) || (a.anchor?.block ?? 0) - (b.anchor?.block ?? 0)), [findings, severity, category, chapter, status]);
  const s = report.summary ?? {};
  const open = findings.filter(f => f.status === 'open');
  const job = report.job;
  return <div className="space-y-4">
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{report.kind === 'ai' ? 'AI review' : 'Rule checks'}</h3>
        <Badge tone={report.status === 'completed' ? 'success' : report.status === 'failed' ? 'danger' : 'warning'}>{report.status}</Badge>
        {report.stale && <Badge tone="warning">Out of date</Badge>}
        <span className="text-xs text-muted-foreground">{timeAgo(report.createdAt)} · {report.inputs.chapters.length} chapter{report.inputs.chapters.length === 1 ? '' : 's'}{report.kind === 'rules' ? ` · design v${report.inputs.designVersion} · rules v${report.rulesVersion}` : ` · ${report.inputs.model}`} · context v{report.inputs.contextVersion}</span>
      </div>
      {report.stale && <Alert tone="warning">The book has changed since this report. Findings may already be fixed or may no longer point at the right text.{report.kind === 'rules' && <Button size="sm" variant="link" className="ms-1 h-auto" disabled={rerunning} onClick={onRerun}>Run checks again</Button>}</Alert>}
      {job && active(report) && <div className="space-y-2"><Progress value={job.total ? (job.progress / job.total) * 100 : 0} /><p className="text-sm">{job.cancelRequested ? 'Cancelling…' : `Reviewed ${job.progress} of ${job.total} chapters.`} {job.creditsReserved} credits reserved.</p>
        <Button size="sm" variant="secondary" disabled={cancelling || job.cancelRequested} onClick={async () => { setCancelling(true); try { await api.post(`/books/${bookId}/quality/ai-reviews/${report.jobId}/cancel`); onChanged(); } finally { setCancelling(false); } }}>Cancel review</Button></div>}
      {job && !active(report) && <p className="text-xs text-muted-foreground">{job.creditsCharged} credits charged{job.error ? ` · ${job.error}` : ''}.{s.discarded ? ` ${s.discarded} AI suggestion${s.discarded === 1 ? ' was' : 's were'} discarded because ${s.discarded === 1 ? 'its quote was' : 'their quotes were'} not found in the chapter.` : ''}</p>}
      {!!s.skipped?.length && <Alert tone="info">{s.skipped.length} chapter{s.skipped.length === 1 ? ' was' : 's were'} not reviewed: {s.skipped.map(k => `${chapters.find(c => c.id === k.id)?.title ?? 'removed chapter'} (${k.reason})`).join('; ')}</Alert>}
      {s.counts && <div className="flex flex-wrap gap-2 text-sm" aria-label="Findings by severity">
        <Badge tone="danger">{s.counts.error} must fix</Badge><Badge tone="warning">{s.counts.warning} should fix</Badge><Badge>{s.counts.info} to consider</Badge>
        {!!s.needsHumanReview && <Badge tone="primary">{s.needsHumanReview} need human review</Badge>}
        <span className="text-xs text-muted-foreground self-center">{open.length} still open</span>
      </div>}
      {s.byCategory && Object.keys(s.byCategory).length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Filter by category">
        {Object.entries(s.byCategory).map(([key, n]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(category === key ? '' : key as QualityCategory)} className={`rounded-full border px-2.5 py-0.5 text-xs ${category === key ? 'border-primary bg-primary-soft' : 'border-border'}`}>{CATEGORY_LABELS[key as QualityCategory] ?? key} · {n}</button>)}
      </div>}
      {s.checks && <details className="text-sm"><summary className="cursor-pointer font-medium">What was checked, and what was not</summary>
        <ul className="mt-2 space-y-1">{s.checks.map(c => <li key={c.id}><span className="font-medium">{c.label}</span> <span className="text-xs text-muted-foreground">— {c.method === 'heuristic' ? 'pattern match' : 'rule'}; {c.scope}</span></li>)}</ul>
        <p className="mt-3 font-medium">Not checked</p><ul className="mt-1 list-disc ps-5 text-muted-foreground">{s.notChecked?.map(n => <li key={n}>{n}</li>)}</ul>
        {s.truncated === true && <p className="mt-2 text-warning">Only the first 1,000 findings are shown.</p>}
      </details>}
    </Card>
    <div className="flex flex-wrap gap-3" role="group" aria-label="Filter findings">
      <FilterSelect id="f-status" label="Status" value={status} onChange={setStatus} options={[['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['', 'All']]} />
      <FilterSelect id="f-severity" label="Severity" value={severity} onChange={setSeverity} options={[['', 'All'], ['error', 'Must fix'], ['warning', 'Should fix'], ['info', 'Consider']]} />
      <FilterSelect id="f-category" label="Category" value={category} onChange={v => setCategory(v as QualityCategory | '')} options={[['', 'All'], ...QUALITY_CATEGORIES.map(c => [c, CATEGORY_LABELS[c]] as [string, string])]} />
      <FilterSelect id="f-chapter" label="Chapter" value={chapter} onChange={setChapter} options={[['', 'All'], ...chapters.map(c => [c.id, `${c.position + 1}. ${c.title}`] as [string, string])]} />
    </div>
    <p className="text-sm text-muted-foreground" role="status">Showing {shown.length} of {findings.length} findings.</p>
    {GROUPS.map(([group, title, hint]) => {
      const items = shown.filter(f => groupOf(f) === group);
      if (!items.length) return null;
      return <section key={group} aria-labelledby={`group-${group}`} className="space-y-3">
        <div><h3 id={`group-${group}`} className="font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">({items.length})</span></h3><p className="text-xs text-muted-foreground">{hint}</p></div>
        {items.slice(0, limits[group]).map(f => <FindingCard key={f.id} finding={f} bookId={bookId} lang={lang} dir={dir} stale={report.stale} onChanged={onChanged} />)}
        {items.length > limits[group] && <Button variant="secondary" onClick={() => setLimits({ ...limits, [group]: limits[group] + PAGE })}>Show {Math.min(PAGE, items.length - limits[group])} more of {items.length - limits[group]} remaining</Button>}
      </section>;
    })}
    {report.status === 'completed' && !shown.length && <EmptyState icon={<span aria-hidden>✓</span>} title={findings.length ? 'No findings match these filters' : 'No problems found by these checks'} description={findings.length ? 'Change the filters to see other findings.' : 'This does not guarantee the book is error-free; see what was not checked above.'} />}
  </div>;
}

function FilterSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <div><Label htmlFor={id} className="mb-1 text-xs">{label}</Label><Select id={id} className="h-9 w-auto min-w-36" value={value} onChange={e => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>;
}

function ContextEditor({ bookId, onSaved }: { bookId: string; onSaved: () => void }) {
  const context = useQuery({ queryKey: ['quality-context', bookId], queryFn: () => api.get<{ context: ContextState }>(`/books/${bookId}/quality/context`).then(r => r.context) });
  if (!context.data) return context.error ? <Alert tone="danger">{errorMessage(context.error)}</Alert> : null;
  // Saving a new context version can make the open report out of date, so reports refresh too.
  return <ContextForm key={context.data.version} bookId={bookId} initial={context.data} onSaved={() => { void context.refetch(); onSaved(); }} />;
}
function ContextForm({ bookId, initial, onSaved }: { bookId: string; initial: ContextState; onSaved: () => void }) {
  const [voice, setVoice] = useState(initial.data.voice);
  const [terms, setTerms] = useState(initial.data.terms.map(t => ({ preferred: t.preferred, avoid: t.avoid.join(', '), note: t.note })));
  const [state, setState] = useState({ busy: false, error: '', notice: '' });
  const data = { voice, terms: terms.map(t => ({ preferred: t.preferred.trim(), avoid: t.avoid.split(',').map(a => a.trim()).filter(Boolean), note: t.note.trim() })) };
  const parsed = bookContextSchema.safeParse(data);
  const update = (i: number, patch: Partial<typeof terms[number]>) => setTerms(terms.map((t, j) => j === i ? { ...t, ...patch } : t));
  async function save() {
    setState({ busy: true, error: '', notice: '' });
    try { await api.put(`/books/${bookId}/quality/context`, { baseVersion: initial.version, data: parsed.success ? parsed.data : data }); setState({ busy: false, error: '', notice: '' }); onSaved(); }
    catch (e) { setState({ busy: false, error: errorMessage(e), notice: '' }); }
  }
  return <details className="rounded-2xl border border-border bg-surface p-4">
    <summary className="cursor-pointer text-sm font-semibold">Voice and terminology (version {initial.version})</summary>
    <div className="mt-3 space-y-4 text-sm">
      <p className="text-muted-foreground">Terms you list here are checked in every chapter, and the AI review uses your voice notes. Edits are versioned; a report made with an older version is marked out of date.</p>
      <div><Label htmlFor="ctx-voice">Voice and style notes</Label><Textarea id="ctx-voice" maxLength={2000} value={voice} onChange={e => setVoice(e.target.value)} placeholder="Warm, practical, second person, short paragraphs…" /></div>
      {initial.briefTerminology && <p className="text-xs text-muted-foreground">From your brief: “{initial.briefTerminology}”. Add the terms below so they can be checked.</p>}
      <div className="space-y-2">
        {terms.map((t, i) => <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
          <div><Label htmlFor={`t-pref-${i}`} className="text-xs">Preferred term</Label><Input id={`t-pref-${i}`} className="h-9" maxLength={80} value={t.preferred} onChange={e => update(i, { preferred: e.target.value })} /></div>
          <div><Label htmlFor={`t-avoid-${i}`} className="text-xs">Avoid (comma-separated)</Label><Input id={`t-avoid-${i}`} className="h-9" value={t.avoid} onChange={e => update(i, { avoid: e.target.value })} /></div>
          <div><Label htmlFor={`t-note-${i}`} className="text-xs">Note</Label><Input id={`t-note-${i}`} className="h-9" maxLength={300} value={t.note} onChange={e => update(i, { note: e.target.value })} /></div>
          <Button size="sm" variant="ghost" className="self-end" aria-label={`Remove term ${t.preferred || i + 1}`} onClick={() => setTerms(terms.filter((_, j) => j !== i))}>Remove</Button>
        </div>)}
        <Button size="sm" variant="secondary" disabled={terms.length >= 100} onClick={() => setTerms([...terms, { preferred: '', avoid: '', note: '' }])}>Add term</Button>
      </div>
      {!parsed.success && <p role="alert" className="text-xs text-danger">{parsed.error.issues.map(i => i.message).join('. ')}</p>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button disabled={!parsed.success || state.busy} loading={state.busy} onClick={() => void save()}>Save voice and terminology</Button>
    </div>
  </details>;
}
