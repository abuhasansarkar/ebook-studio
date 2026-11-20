"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { bookDesignSchema, getLanguage, type BookDesign, type DesignTemplate } from '@ebook/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useBook } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Alert, Badge, ErrorState, PageLoader } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { HistoryPanel, MatterControls, PrintControls, TemplateGallery, TextControls } from './design-controls';
import { DesignPreview } from './design-preview';
import type { Capabilities, PreviewSource, SavedDesign } from './design-types';

const TABS = [['templates', 'Templates'], ['text', 'Text & reader'], ['print', 'Print layout'], ['matter', 'Matter'], ['history', 'History']] as const;
type Tab = typeof TABS[number][0];

export function DesignStudio({ bookId }: { bookId: string }) {
  const { data: session } = useSession();
  const book = useBook(bookId);
  const design = useQuery({ queryKey: ['design', session?.user.id, bookId], queryFn: () => api.get<{ design: SavedDesign }>(`/books/${bookId}/design`).then(r => r.design), enabled: !!session, staleTime: Infinity, refetchOnWindowFocus: false });
  const templates = useQuery({ queryKey: ['design-templates'], queryFn: () => api.get<{ templates: DesignTemplate[] }>('/design/templates').then(r => r.templates), staleTime: Infinity });
  const capabilities = useQuery({ queryKey: ['design-capabilities'], queryFn: () => api.get<Capabilities>('/design/capabilities'), staleTime: 60_000 });
  const failed = design.error ?? templates.error ?? capabilities.error ?? book.error;
  if (failed) return <div className="mx-auto max-w-4xl px-4 py-8"><ErrorState message={errorMessage(failed)} onRetry={() => { void design.refetch(); void templates.refetch(); void capabilities.refetch(); void book.refetch(); }} /></div>;
  if (!session || !design.data || !templates.data || !capabilities.data || !book.data) return <PageLoader label="Loading interior design…" />;
  return <DesignWorkspace key={`${session.user.id}:${bookId}`} bookId={bookId} ownerId={session.user.id} language={book.data.language} written={book.data.chapters.filter(c => c.wordCount > 0).length} initial={design.data} templates={templates.data} capabilities={capabilities.data} />;
}

function DesignWorkspace({ bookId, ownerId, language, written, initial, templates, capabilities }: { bookId: string; ownerId: string; language: string; written: number; initial: SavedDesign; templates: DesignTemplate[]; capabilities: Capabilities }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<BookDesign>(initial.data);
  const [tab, setTab] = useState<Tab>('templates');
  const [source, setSource] = useState<PreviewSource>({ kind: 'draft' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoVersion, setUndoVersion] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [recovery, setRecovery] = useState<{ version: number; data: BookDesign } | null>(null);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.data);
  const validation = useMemo(() => bookDesignSchema.safeParse(draft), [draft]);
  const issues = validation.success ? [] : validation.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
  const support = capabilities.languages.find(l => l.code === language);
  const draftKey = `ebook-design:${ownerId}:${bookId}`;

  function forgetDraft() { try { sessionStorage.removeItem(draftKey); } catch { setStorageWarning('Browser draft storage is unavailable; unsaved design changes are lost if you leave.'); } }
  function accept(next: SavedDesign, message: string, undo: number | null = null) {
    setSaved(next); setDraft(next.data); setConflict(false); setUndoVersion(undo); setNotice(message); setError(''); forgetDraft();
    setSource({ kind: 'draft' });
    qc.setQueryData(['design', ownerId, bookId], next);
    void qc.invalidateQueries({ queryKey: ['design-versions', bookId] });
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(errorMessage(e)); if (e instanceof ApiError && e.status === 409 && !e.message.includes('typeset')) setConflict(true); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    if (!validation.success) throw new Error('Fix the highlighted settings before saving.');
    const { design } = await api.put<{ design: SavedDesign }>(`/books/${bookId}/design`, { baseVersion: saved.version, data: validation.data });
    accept(design, `Design saved as version ${design.version}.`);
  });
  const applyTemplate = (template: DesignTemplate) => run(async () => {
    const previous = saved.version;
    const { design } = await api.post<{ design: SavedDesign }>(`/books/${bookId}/design/apply-template`, { baseVersion: saved.version, templateId: template.id, templateVersion: template.version });
    accept(design, `Applied ${template.name} as version ${design.version}. Front and back matter were not changed.`, previous);
  });
  const restore = (version: number, label: string) => run(async () => {
    const { design } = await api.post<{ design: SavedDesign }>(`/books/${bookId}/design/restore`, { baseVersion: saved.version, version });
    accept(design, `${label} Restored as version ${design.version}; the replaced version stays in history.`, null);
  });
  const reloadLatest = (keepDraft: boolean) => run(async () => {
    const { design } = await api.get<{ design: SavedDesign }>(`/books/${bookId}/design`);
    setSaved(design); setConflict(false); qc.setQueryData(['design', ownerId, bookId], design);
    if (!keepDraft) { setDraft(design.data); forgetDraft(); }
    setNotice(keepDraft ? `Your draft is kept on top of version ${design.version}. Review the preview, then save to replace it.` : `Loaded saved version ${design.version}.`);
  });

  // Recover an unsaved design draft from this tab session.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) { const parsed = JSON.parse(raw) as { version: number; data: unknown }; const data = bookDesignSchema.safeParse(parsed.data); if (data.success && Number.isInteger(parsed.version)) setRecovery({ version: parsed.version, data: data.data }); }
      } catch { setStorageWarning('Your browser draft could not be read.'); }
      setReady(true);
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!ready || recovery) return;
    try { if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ version: saved.version, data: draft })); else sessionStorage.removeItem(draftKey); }
    catch { queueMicrotask(() => setStorageWarning('Browser draft storage is unavailable; unsaved design changes are lost if you leave.')); }
  }, [ready, recovery, dirty, draftKey, saved.version, draft]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const navigate = (e: MouseEvent) => { const link = (e.target as Element)?.closest?.('a'); if (link?.href && !link.download && !link.href.startsWith('blob:') && !window.confirm('Leave with unsaved design changes? A browser draft is kept for this tab when storage is available.')) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true); };
  }, [dirty]);

  const disabled = busy || !ready || !!recovery;
  const templateName = draft.template ? templates.find(t => t.id === draft.template!.id)?.name : null;
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">Interior design</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Typography and layout for the reader edition and print-layout PDF. Templates copy their settings into your book, so later template updates never change it silently.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="text-sm text-muted-foreground">{dirty ? 'Unsaved changes' : saved.version ? `Saved version ${saved.version}` : 'Default design (not saved yet)'}</span>
        {templateName && <Badge tone="primary">{templateName} template</Badge>}
        {support && <Badge tone={support.level === 'full' ? 'success' : 'danger'}>{getLanguage(language).name}: {support.level === 'full' ? 'fonts installed' : 'fonts unavailable'}</Badge>}
        <Button variant="secondary" disabled={disabled || !dirty} onClick={() => { if (window.confirm('Discard unsaved design changes?')) { setDraft(saved.data); forgetDraft(); setNotice('Changes discarded.'); } }}>Discard</Button>
        <Button loading={busy} disabled={disabled || conflict || !dirty || !validation.success} onClick={() => void save()}>Save design</Button>
      </div>
    </div>

    {recovery && <Alert tone="info"><p>An unsaved design draft from this tab was found (based on version {recovery.version}).</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => { setDraft(recovery.data); setRecovery(null); setNotice(recovery.version === saved.version ? 'Draft recovered. Review and save it.' : `Draft recovered, but version ${saved.version} is now saved. Saving will ask you to review the conflict.`); }}>Recover design draft</Button><Button size="sm" variant="secondary" onClick={() => { forgetDraft(); setRecovery(null); }}>Discard design draft</Button></div></Alert>}
    {error && <Alert tone="danger">{error}</Alert>}
    {notice && <Alert tone="success"><span>{notice}</span>{undoVersion !== null && <Button size="sm" variant="link" className="ms-2" disabled={busy} onClick={() => void restore(undoVersion, 'Template undone.')}>Undo template</Button>}</Alert>}
    {storageWarning && <Alert tone="warning">{storageWarning}</Alert>}
    {conflict && <Alert tone="warning"><p>This design was changed elsewhere. Choose how to continue:</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void reloadLatest(true)}>Keep my draft and review latest</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm('Discard your draft and load the saved design?')) void reloadLatest(false); }}>Load saved design</Button></div></Alert>}
    {support?.level === 'unavailable' && <Alert tone="danger">{support.notes[0]} Previews use fallback fonts and exports are blocked until an operator installs the approved fonts.</Alert>}
    {written === 0 && <Alert tone="info">No chapters have content yet. Previews show front and back matter only. <Link className="font-semibold underline" href={`/app/books/${bookId}/generate`}>Write chapters</Link></Alert>}

    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="min-w-0" aria-label="Design settings">
        <div role="tablist" aria-label="Design sections" className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map(([key, label]) => <button key={key} id={`design-tab-${key}`} role="tab" type="button" aria-selected={tab === key} aria-controls={`design-panel-${key}`} tabIndex={tab === key ? 0 : -1}
            onKeyDown={e => { const i = TABS.findIndex(t => t[0] === tab); const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : -1; if (next >= 0) { e.preventDefault(); setTab(TABS[next][0]); document.getElementById(`design-tab-${TABS[next][0]}`)?.focus(); } }}
            onClick={() => setTab(key)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</button>)}
        </div>
        <div role="tabpanel" id={`design-panel-${tab}`} aria-labelledby={`design-tab-${tab}`} className="pt-5">
          <fieldset disabled={disabled} className="min-w-0">
            {tab === 'templates' && <TemplateGallery templates={templates} draft={draft} current={draft.template} dirty={dirty} busy={busy} previewing={source.kind === 'template' ? source.template.id : null} onPreview={t => setSource(t ? { kind: 'template', template: t } : { kind: 'draft' })} onApply={t => void applyTemplate(t)} />}
            {tab === 'text' && <TextControls draft={draft} onChange={setDraft} />}
            {tab === 'print' && <PrintControls draft={draft} onChange={setDraft} issues={issues} limits={capabilities.limits} />}
            {tab === 'matter' && <MatterControls draft={draft} onChange={setDraft} issues={issues} />}
            {tab === 'history' && <HistoryPanel bookId={bookId} saved={saved.version} busy={busy} dirty={dirty} previewing={source.kind === 'version' ? source.version : null} onPreview={v => setSource(v === null ? { kind: 'draft' } : { kind: 'version', version: v })} onRestore={v => void restore(v, `Version ${v} restored.`)} />}
          </fieldset>
          {issues.length > 0 && tab !== 'print' && tab !== 'matter' && <Alert tone="warning" className="mt-4">{issues.length} setting{issues.length === 1 ? ' needs' : 's need'} attention: {issues.map(i => i.message).join('; ')}.</Alert>}
        </div>
      </section>
      <DesignPreview bookId={bookId} draft={draft} valid={validation.success} source={source} onResetSource={() => setSource({ kind: 'draft' })} />
    </div>
  </div>;
}
