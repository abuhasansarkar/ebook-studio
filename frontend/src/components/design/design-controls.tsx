"use client";

import { useQuery } from '@tanstack/react-query';
import { TRIM_SIZES, applyTemplate, designChanges, type BookDesign, type DesignTemplate, type TrimSize } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';
import type { DesignVersionRow } from './design-types';

type Change = (next: BookDesign) => void;
type Issue = { path: string; message: string };
const show = (v: unknown) => typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'string' && v in TRIM_SIZES ? TRIM_SIZES[v as TrimSize].label : String(v);
const group = 'space-y-4';
const legend = 'text-sm font-semibold text-foreground';

function Choice<T extends string>({ id, label, value, options, onChange, hint }: { id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  return <div><Label htmlFor={id}>{label}</Label><Select id={id} value={value} onChange={e => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>;
}
function NumberField({ id, label, value, min, max, step, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return <div><Label htmlFor={id}>{label}{unit ? ` (${unit})` : ''}</Label><Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
    onChange={e => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.round(n * 100) / 100); }} /></div>;
}
function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return <div><label htmlFor={id} className="flex items-center gap-2 text-sm font-medium"><input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>{hint && <p className="ms-6 mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>;
}
function IssueText({ issues, prefix }: { issues: Issue[]; prefix: string }) {
  const found = issues.filter(i => i.path.startsWith(prefix));
  return found.length ? <p role="alert" className="mt-1 text-xs text-danger">{found.map(i => i.message).join('. ')}</p> : null;
}

export function TemplateGallery({ templates, draft, current, dirty, busy, previewing, onPreview, onApply }: { templates: DesignTemplate[]; draft: BookDesign; current: BookDesign['template']; dirty: boolean; busy: boolean; previewing: string | null; onPreview: (t: DesignTemplate | null) => void; onApply: (t: DesignTemplate) => void }) {
  return <div className={group}>
    <p className="text-sm text-muted-foreground">Preview a template before applying it. Applying saves a new design version you can undo; it changes typography and layout but never your front or back matter.</p>
    {dirty && <Alert tone="warning">Save or discard your unsaved changes before applying a template.</Alert>}
    {templates.map(t => {
      const changes = designChanges(draft, applyTemplate(draft, t));
      const active = current?.id === t.id && current.version === t.version;
      return <Card key={`${t.id}@${t.version}`} className="p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t.name}</h3><span className="text-xs text-muted-foreground">v{t.version}</span>{active && <Badge tone="success">Current</Badge>}{t.applies.map(a => <Badge key={a}>{a === 'print' ? 'Print PDF' : 'Reader'}</Badge>)}</div>
        <p className="mt-1 text-sm font-medium">{t.intendedUse}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">{TRIM_SIZES[t.settings.print.trim].label} · {t.settings.typography.body} text · {t.settings.typography.headings} headings · {t.settings.typography.paragraph} paragraphs</p>
        {previewing === t.id && <div className="mt-3 rounded-xl bg-muted p-3 text-xs" aria-live="polite">
          {changes.length ? <><p className="font-semibold">Applying changes {changes.length} setting{changes.length === 1 ? '' : 's'}:</p><ul className="mt-1 space-y-0.5">{changes.map(c => <li key={c.path}><span className="font-medium">{c.label}</span>{c.scope !== 'shared' && <span className="text-muted-foreground"> ({c.scope})</span>}: {show(c.from)} → {show(c.to)}</li>)}</ul></> : <p>No settings change; your design already matches this template.</p>}
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" aria-pressed={previewing === t.id} onClick={() => onPreview(previewing === t.id ? null : t)}>{previewing === t.id ? 'Stop previewing' : `Preview ${t.name}`}</Button>
          <Button size="sm" disabled={dirty || busy || (active && changes.length === 0)} onClick={() => onApply(t)}>Apply {t.name}</Button>
        </div>
      </Card>;
    })}
  </div>;
}

export function TextControls({ draft, onChange }: { draft: BookDesign; onChange: Change }) {
  const t = draft.typography, e = draft.elements, d = draft.digital;
  const typo = (patch: Partial<BookDesign['typography']>) => onChange({ ...draft, typography: { ...t, ...patch } });
  const el = (patch: Partial<BookDesign['elements']>) => onChange({ ...draft, elements: { ...e, ...patch } });
  const dig = (patch: Partial<BookDesign['digital']>) => onChange({ ...draft, digital: { ...d, ...patch } });
  return <div className="space-y-6">
    <fieldset className={group}><legend className={legend}>Typography (reader and print)</legend>
      <div className="grid grid-cols-2 gap-3">
        <Choice id="body-font" label="Body text" value={t.body} options={[['serif', 'Serif'], ['sans', 'Sans-serif']]} onChange={v => typo({ body: v })} />
        <Choice id="heading-font" label="Headings" value={t.headings} options={[['serif', 'Serif'], ['sans', 'Sans-serif']]} onChange={v => typo({ headings: v })} />
        <Choice id="paragraph-style" label="Paragraphs" value={t.paragraph} options={[['spaced', 'Spaced blocks'], ['indented', 'Indented (book style)']]} onChange={v => typo({ paragraph: v })} />
        <Choice id="text-align" label="Alignment" value={t.align} options={[['start', 'Ragged edge'], ['justify', 'Justified']]} onChange={v => typo({ align: v })} />
        <Choice id="heading-scale" label="Heading size" value={t.headingScale} options={[['compact', 'Compact'], ['standard', 'Standard'], ['dramatic', 'Large']]} onChange={v => typo({ headingScale: v })} />
        <NumberField id="line-height" label="Line height" value={t.lineHeight} min={1.2} max={2.2} step={0.05} onChange={v => typo({ lineHeight: v })} />
      </div>
      <Toggle id="hyphenate" label="Hyphenate long words" checked={t.hyphenate} onChange={v => typo({ hyphenate: v })} hint="Applied only where the renderer has a dictionary for the book language." />
      <p className="text-xs text-muted-foreground">Fonts are chosen per script from approved, bundled Noto families. CJK books use sans-serif for both settings; Urdu uses a minimum line height of 2.0.</p>
    </fieldset>
    <fieldset className={group}><legend className={legend}>Chapters, tables and images</legend>
      <div className="grid grid-cols-2 gap-3">
        <Choice id="chapter-label" label="Chapter label" value={e.chapterLabel} options={[['number', 'Number'], ['word', 'Word + number'], ['none', 'None']]} onChange={v => el({ chapterLabel: v })} />
        <Choice id="chapter-ornament" label="Title ornament" value={e.chapterOrnament} options={[['none', 'None'], ['rule', 'Short rule']]} onChange={v => el({ chapterOrnament: v })} />
        <Choice id="table-style" label="Tables" value={e.tableStyle} options={[['grid', 'Full grid'], ['lines', 'Horizontal lines']]} onChange={v => el({ tableStyle: v })} />
        <Choice id="image-width" label="Images" value={e.imageWidth} options={[['full', 'Full width'], ['medium', 'Medium (70%)']]} onChange={v => el({ imageWidth: v })} />
        <Choice id="caption-align" label="Captions" value={e.captionAlign} options={[['center', 'Centred'], ['start', 'Aligned to text']]} onChange={v => el({ captionAlign: v })} />
        <div><Label htmlFor="accent">Accent colour</Label><Input id="accent" type="color" className="p-1" value={e.accent} onChange={ev => el({ accent: ev.target.value })} /></div>
      </div>
    </fieldset>
    <fieldset className={group}><legend className={legend}>Reader edition defaults</legend>
      <p className="text-xs text-muted-foreground">Reflowable reader settings only. E-reader users can still change size and width themselves; these are your starting values.</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="font-scale" label="Text size" unit="× 16 px" value={d.fontScale} min={0.85} max={1.4} step={0.05} onChange={v => dig({ fontScale: v })} />
        <Choice id="line-width" label="Line width" value={d.lineWidth} options={[['narrow', 'Narrow'], ['standard', 'Standard'], ['wide', 'Wide']]} onChange={v => dig({ lineWidth: v })} />
      </div>
    </fieldset>
  </div>;
}

export function PrintControls({ draft, onChange, issues, limits }: { draft: BookDesign; onChange: Change; issues: Issue[]; limits: string[] }) {
  const p = draft.print;
  const set = (patch: Partial<BookDesign['print']>) => onChange({ ...draft, print: { ...p, ...patch } });
  const margin = (key: keyof BookDesign['print']['margins'], v: number) => set({ margins: { ...p.margins, [key]: v } });
  const trim = TRIM_SIZES[p.trim];
  const block = { w: trim.width - p.margins.inside - p.margins.outside, h: trim.height - p.margins.top - p.margins.bottom };
  return <div className="space-y-6">
    <Alert tone="info">Print settings apply only to the print-layout PDF. They never appear in the reader edition. This is a layout, not a print-ready file: bleed, cover wrap and printer preflight are not validated yet.</Alert>
    <fieldset className={group}><legend className={legend}>Page</legend>
      <div className="grid grid-cols-2 gap-3">
        <Choice id="trim" label="Trim size" value={p.trim} options={(Object.keys(TRIM_SIZES) as TrimSize[]).map(k => [k, TRIM_SIZES[k].label])} onChange={v => set({ trim: v })} />
        <NumberField id="print-size" label="Text size" unit="pt" value={p.fontSizePt} min={8} max={14} step={0.5} onChange={v => set({ fontSizePt: v })} />
      </div>
    </fieldset>
    <fieldset className={group}><legend className={legend}>Margins (inches)</legend>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="margin-top" label="Top" value={p.margins.top} min={0.25} max={1.5} step={0.05} onChange={v => margin('top', v)} />
        <NumberField id="margin-bottom" label="Bottom" value={p.margins.bottom} min={0.25} max={1.5} step={0.05} onChange={v => margin('bottom', v)} />
        <NumberField id="margin-inside" label={p.mirrored ? 'Inside (spine)' : 'Left'} value={p.margins.inside} min={0.25} max={1.5} step={0.05} onChange={v => margin('inside', v)} />
        <NumberField id="margin-outside" label={p.mirrored ? 'Outside' : 'Right'} value={p.margins.outside} min={0.25} max={1.5} step={0.05} onChange={v => margin('outside', v)} />
      </div>
      <Toggle id="mirrored" label="Mirror margins on facing pages" checked={p.mirrored} onChange={v => set({ mirrored: v })} hint="Keeps the wider inside margin next to the spine on left and right pages, including right-to-left books." />
      <p className="text-xs text-muted-foreground" role="status">Text block: {block.w.toFixed(2)} × {block.h.toFixed(2)} in on a {trim.label} page.</p>
      <IssueText issues={issues} prefix="print" />
    </fieldset>
    <fieldset className={group}><legend className={legend}>Running heads and page numbers</legend>
      <div className="grid grid-cols-2 gap-3">
        <Choice id="running-head" label="Running head" value={p.header} options={[['none', 'None'], ['title', 'Book title'], ['author-title', 'Author left / title right']]} onChange={v => set({ header: v })} />
        <Choice id="page-numbers" label="Page numbers" value={p.pageNumbers} options={[['none', 'None'], ['bottom-center', 'Bottom centre'], ['bottom-outside', 'Bottom outside']]} onChange={v => set({ pageNumbers: v })} />
      </div>
      <p className="text-xs text-muted-foreground">Front-matter pages (title, copyright, dedication, contents) never show running heads or numbers.</p>
    </fieldset>
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Known print layout limits</summary><ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">{limits.map(l => <li key={l}>{l}</li>)}</ul></details>
  </div>;
}

export function MatterControls({ draft, onChange, issues }: { draft: BookDesign; onChange: Change; issues: Issue[] }) {
  const m = draft.matter;
  const set = <K extends keyof BookDesign['matter']>(key: K, value: BookDesign['matter'][K]) => onChange({ ...draft, matter: { ...m, [key]: value } });
  const textSection = (key: 'copyright' | 'dedication', label: string, hint: string, max: number) => <fieldset className={group} key={key}>
    <Toggle id={`${key}-enabled`} label={label} checked={m[key].enabled} onChange={v => set(key, { ...m[key], enabled: v })} hint="Optional" />
    {m[key].enabled && <div><Label htmlFor={`${key}-text`}>{label} text <span className="font-normal text-muted-foreground">(required when included)</span></Label><Textarea id={`${key}-text`} maxLength={max} value={m[key].text} onChange={e => set(key, { ...m[key], text: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{hint}</p><IssueText issues={issues} prefix={`matter.${key}`} /></div>}
  </fieldset>;
  const titled = (key: 'aboutAuthor' | 'references', label: string, hint: string, max: number) => <fieldset className={group} key={key}>
    <Toggle id={`${key}-enabled`} label={label} checked={m[key].enabled} onChange={v => set(key, { ...m[key], enabled: v })} hint="Optional · back matter, listed in the contents" />
    {m[key].enabled && <>
      <div><Label htmlFor={`${key}-title`}>Heading</Label><Input id={`${key}-title`} maxLength={80} value={m[key].title} onChange={e => set(key, { ...m[key], title: e.target.value })} /></div>
      <div><Label htmlFor={`${key}-text`}>{label} text <span className="font-normal text-muted-foreground">(required when included)</span></Label><Textarea id={`${key}-text`} className="min-h-32" maxLength={max} value={m[key].text} onChange={e => set(key, { ...m[key], text: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
      <IssueText issues={issues} prefix={`matter.${key}`} />
    </>}
  </fieldset>;
  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Front matter appears before chapter 1; back matter after the last chapter. Title, subtitle and author come from the book details. Text is plain: blank lines start new paragraphs.</p>
    <fieldset className={group}><legend className={legend}>Front matter</legend>
      <Toggle id="title-page" label="Title page" checked={m.titlePage} onChange={v => set('titlePage', v)} hint="Recommended. Shows title, subtitle and author." />
    </fieldset>
    {textSection('copyright', 'Copyright page', 'State the rights you hold. eBookStudio does not verify ownership or provide legal advice.', 3000)}
    {textSection('dedication', 'Dedication', 'Shown centred on its own page in print.', 1000)}
    <fieldset className={group}>
      <Toggle id="contents-enabled" label="Table of contents" checked={m.contents.enabled} onChange={v => set('contents', { ...m.contents, enabled: v })} hint="Recommended. Entries link to each chapter; printed contents do not show page numbers." />
      {m.contents.enabled && <div><Label htmlFor="contents-title">Contents heading</Label><Input id="contents-title" maxLength={80} value={m.contents.title} onChange={e => set('contents', { ...m.contents, title: e.target.value })} /><IssueText issues={issues} prefix="matter.contents" /></div>}
    </fieldset>
    <h3 className={legend}>Back matter</h3>
    {titled('aboutAuthor', 'About the author', 'A short biography, in the book language.', 5000)}
    {titled('references', 'References', 'One reference per line. Sources are not checked for accuracy.', 20000)}
  </div>;
}

export function HistoryPanel({ bookId, saved, busy, dirty, previewing, onPreview, onRestore }: { bookId: string; saved: number; busy: boolean; dirty: boolean; previewing: number | null; onPreview: (v: number | null) => void; onRestore: (v: number) => void }) {
  const history = useQuery({ queryKey: ['design-versions', bookId], queryFn: () => api.get<{ versions: DesignVersionRow[] }>(`/books/${bookId}/design/versions`).then(r => r.versions) });
  if (history.error) return <Alert tone="danger">{errorMessage(history.error)} <Button size="sm" variant="link" onClick={() => void history.refetch()}>Retry</Button></Alert>;
  if (!history.data) return <p role="status" className="text-sm text-muted-foreground">Loading versions…</p>;
  if (!history.data.length) return <p className="text-sm text-muted-foreground">No saved versions yet. The default design is used until you save or apply a template.</p>;
  const describe = (v: DesignVersionRow) => v.action === 'template' ? `Applied template ${v.detail.replace('@', ' v')}` : v.action === 'restore' ? `Restored version ${v.detail}` : 'Saved changes';
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Every save, template and restore is kept. Restoring copies an older version into a new one, so nothing is overwritten.{dirty ? ' Save or discard your changes before restoring.' : ''}</p>
    <ol className="divide-y divide-border rounded-xl border border-border">
      {history.data.map(v => <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
        <div><p className="font-medium">Version {v.version}{v.version === saved && <Badge tone="success" className="ms-2">Current</Badge>}</p><p className="text-xs text-muted-foreground">{describe(v)} · {timeAgo(v.createdAt)}</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" aria-pressed={previewing === v.version} onClick={() => onPreview(previewing === v.version ? null : v.version)}>{previewing === v.version ? 'Stop preview' : 'Preview'}</Button>
          <Button size="sm" variant="secondary" disabled={busy || dirty || v.version === saved} onClick={() => onRestore(v.version)}>Restore</Button>
        </div>
      </li>)}
    </ol>
  </div>;
}
