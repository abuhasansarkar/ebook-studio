"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { applyTemplate, type BookDesign } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import { Alert, Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import type { PreviewSource, ReaderPreviewResult } from './design-types';

const WIDTHS = [['phone', 'Phone', 375], ['tablet', 'Tablet', 768], ['desktop', 'Desktop', 1100]] as const;
type Width = typeof WIDTHS[number][0];
type PrintSample = { url: string; pages: number; chapters: number; partial: boolean; fallback: string[]; overflow: string[]; type3: string[]; key: string };

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}
function requestBody(source: PreviewSource, draft: BookDesign) {
  if (source.kind === 'version') return { version: source.version };
  return { data: source.kind === 'template' ? applyTemplate(draft, source.template) : draft };
}
const sourceLabel = (s: PreviewSource) => s.kind === 'version' ? `saved version ${s.version}` : s.kind === 'template' ? `${s.template.name} template (not applied)` : 'your current settings';

export function DesignPreview({ bookId, draft, valid, source, onResetSource }: { bookId: string; draft: BookDesign; valid: boolean; source: PreviewSource; onResetSource: () => void }) {
  const [mode, setMode] = useState<'reader' | 'print'>('reader');
  const body = useDebounced(JSON.stringify(requestBody(source, draft)), 500);
  const canRender = valid || source.kind === 'version';
  return <section className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Preview">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <RadioGroup
        label="Preview type"
        value={mode}
        onChange={setMode}
        className="rounded-xl border border-border p-0.5"
        itemClassName={(_option, selected) => cn('rounded-lg px-3 py-1.5 text-sm font-medium', selected ? 'bg-primary-soft text-primary-hover' : 'text-muted-foreground hover:text-foreground')}
        options={[
          { value: 'reader', label: 'Reader preview' },
          { value: 'print', label: 'Print sample (PDF)' },
        ]}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">Showing {sourceLabel(source)}{source.kind !== 'draft' && <Button size="sm" variant="link" className="ms-1 h-auto" onClick={onResetSource}>Back to current settings</Button>}</p>
    </div>
    {!canRender && <Alert tone="warning" className="mt-3">Fix the highlighted settings to refresh the preview.</Alert>}
    {mode === 'reader' ? <ReaderPreview bookId={bookId} body={body} enabled={canRender} /> : <PrintPreview bookId={bookId} body={body} enabled={canRender} />}
  </section>;
}

function ReaderPreview({ bookId, body, enabled }: { bookId: string; body: string; enabled: boolean }) {
  const [width, setWidth] = useState<Width>('phone');
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const preview = useQuery({ queryKey: ['design-preview', bookId, body], queryFn: () => api.post<ReaderPreviewResult>(`/books/${bookId}/design/preview`, { mode: 'reader', ...JSON.parse(body) }), enabled, placeholderData: prev => prev, staleTime: 30_000 });
  // The sandboxed frame runs no scripts; the parent sets the reader's own text size, like an e-reader setting.
  const applyScale = () => frame.current?.contentDocument?.documentElement.style.setProperty('--reader-scale', String(scale));
  useEffect(applyScale);
  const px = WIDTHS.find(w => w[0] === width)![2];
  // Simulated devices keep their real CSS width and are scaled down to fit the panel, never clipped.
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number>(px);
  useEffect(() => {
    const element = box.current; if (!element) return;
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const fit = Math.min(1, available / px);
  const height = 760;
  const d = preview.data?.diagnostics;
  return <div className="mt-3 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <RadioGroup
        label="Reading width"
        value={width}
        onChange={setWidth}
        className="rounded-xl border border-border p-0.5"
        itemClassName={(_option, selected) => cn('rounded-lg px-2.5 py-1 text-xs font-medium', selected ? 'bg-muted text-foreground' : 'text-muted-foreground')}
        options={WIDTHS.map(([key, label, w]) => ({ value: key, label, title: `${w}px wide` }))}
      />
      <div className="inline-flex items-center gap-1" role="group" aria-label="Reader text size"><Button size="sm" variant="secondary" aria-label="Smaller reader text" disabled={scale <= 0.8} onClick={() => setScale(s => Math.round((s - 0.1) * 10) / 10)}>A−</Button><span className="w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(scale * 100)}%</span><Button size="sm" variant="secondary" aria-label="Larger reader text" disabled={scale >= 1.6} onClick={() => setScale(s => Math.round((s + 0.1) * 10) / 10)}>A+</Button></div>
      {preview.isFetching && <Spinner className="h-4 w-4" label="Updating preview" />}
    </div>
    <p className="text-xs text-muted-foreground">Reflowable: no fixed pages, page numbers, running heads, trim or margins. Width and text-size controls simulate what a reader may choose and are not saved.</p>
    {preview.error && <Alert tone="danger">{errorMessage(preview.error)} <Button size="sm" variant="link" onClick={() => void preview.refetch()}>Retry</Button></Alert>}
    <div className="rounded-2xl border border-border bg-muted p-2 sm:p-3">
      <div ref={box} className="w-full">
        {preview.data ? <div className="mx-auto overflow-hidden rounded-lg bg-white shadow-card" style={{ width: px * fit, height: height * fit }}>
          <iframe ref={frame} title="Reader preview" sandbox="allow-same-origin" srcDoc={preview.data.html} onLoad={applyScale} className="block origin-top-left" style={{ width: px, height, transform: fit < 1 ? `scale(${fit})` : undefined }} />
        </div> : <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground" role="status">{enabled ? 'Rendering preview…' : 'Preview unavailable'}</div>}
      </div>
      {preview.data && fit < 1 && <p className="mt-2 text-center text-xs text-muted-foreground">{px} px wide, shown at {Math.round(fit * 100)}% to fit.</p>}
    </div>
    {d && <Diagnostics glyphs={d.glyphs} notes={d.support.notes} unavailable={d.support.level === 'unavailable'} />}
  </div>;
}

function Diagnostics({ glyphs, notes, unavailable }: { glyphs: ReaderPreviewResult['diagnostics']['glyphs']; notes: string[]; unavailable: boolean }) {
  return <div className="space-y-2">
    {glyphs.map(g => <Alert key={g.role} tone="warning"><p className="font-semibold">{g.count} character{g.count === 1 ? '' : 's'} in {g.role === 'heading' ? 'titles and headings' : 'body text'} {g.count === 1 ? 'has' : 'have'} no approved font.</p><p className="mt-1">They will be drawn with a system font or appear as empty boxes in exported files: <span className="font-mono">{g.characters.map(c => `${c.char} (${c.codepoint})`).join(', ')}{g.count > g.characters.length ? ' …' : ''}</span></p></Alert>)}
    {notes.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Language and font notes{unavailable ? ' (fonts missing)' : ''}</summary><ul className="mt-1 list-disc ps-5">{notes.map(n => <li key={n}>{n}</li>)}</ul></details>}
  </div>;
}

function PrintPreview({ bookId, body, enabled }: { bookId: string; body: string; enabled: boolean }) {
  const [sample, setSample] = useState<PrintSample | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (sample) URL.revokeObjectURL(sample.url); }, [sample]);
  async function render() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/v1/books/${bookId}/design/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'print', ...JSON.parse(body) }) });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error?.details?.[0]?.message ?? data?.error?.message ?? 'The print sample could not be rendered.'); }
      const list = (h: string, sep: string) => decodeURIComponent(response.headers.get(h) ?? '').split(sep).filter(Boolean);
      setSample({ url: URL.createObjectURL(await response.blob()), pages: Number(response.headers.get('X-Page-Count')), chapters: Number(response.headers.get('X-Sample-Chapters')), partial: response.headers.get('X-Sample-Partial') === 'true', fallback: list('X-Fallback-Fonts', ','), overflow: list('X-Layout-Overflow', '\n'), type3: list('X-Type3-Fonts', ','), key: body });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const stale = sample && sample.key !== body;
  return <div className="mt-3 space-y-3">
    <p className="text-xs text-muted-foreground">An actual PDF from the export renderer, with the same fonts and layout engine as your exported file. It covers the front matter and the first chapters only. The full file comes from <Link className="underline" href={`/app/books/${bookId}/export`}>Export</Link>. Your browser&apos;s PDF viewer may show single pages rather than facing spreads.</p>
    <div className="flex flex-wrap items-center gap-2"><Button loading={busy} disabled={!enabled} onClick={() => void render()}>{sample ? 'Render again' : 'Render print sample'}</Button>{sample && <a className="text-sm font-medium underline" href={sample.url} download="print-sample.pdf">Download sample</a>}</div>
    {error && <Alert tone="danger">{error}</Alert>}
    {stale && <Alert tone="warning">Settings changed since this sample was rendered. Render again to see them.</Alert>}
    {sample && <>
      <p className="text-sm" role="status">{sample.pages} pages · {sample.chapters} chapter{sample.chapters === 1 ? '' : 's'}{sample.partial ? ' (sample — later chapters omitted)' : ''}</p>
      {sample.fallback.length > 0 && <Alert tone="warning">Some text used fonts that are not bundled: {sample.fallback.join(', ')}. Check the characters listed in the reader preview.</Alert>}
      {sample.overflow.length > 0 && <Alert tone="warning">Content wider than the printed text block: {sample.overflow.join('; ')}.</Alert>}
      {sample.type3.length > 0 && <Alert tone="warning">Outline-converted (Type 3) fonts found: {sample.type3.join(', ')}. Printers may reject them.</Alert>}
      <iframe title="Print sample PDF" src={sample.url} className="h-[72vh] min-h-[460px] w-full rounded-2xl border border-border bg-white" />
    </>}
  </div>;
}
