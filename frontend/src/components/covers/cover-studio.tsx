"use client";

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COVER_FONTS, COVER_HEIGHT, COVER_WIDTH, coverDesignSchema, coverTextStyle, type CoverDesign, type CoverText } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { operationRequest } from '@/lib/operation-request';
import { useSession } from '@/lib/auth-client';
import { qk } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { PageHeader } from '@/components/app/app-shell';
import { AssetLibrary, imageUrl } from '@/components/assets/asset-library';

type SavedCover = { version: number; data: CoverDesign };
type ImageJob = { id: string; status: string; cancelRequested: boolean; assetId: string | null; creditsReserved: number; creditsCharged: number; error: string | null; input: { request: { purpose: string; prompt: string }; visual: CoverDesign['visual'] } };
const layerKeys = ['title', 'subtitle', 'author'] as const;
type LayerKey = typeof layerKeys[number];
function contrastAgainstBackground(text: string, background: string, shade: number) {
  const luminance = (hex: string, multiplier: number) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255 * multiplier).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(text, 1), b = luminance(background, 1 - shade);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}


export function CoverStudio({ bookId }: { bookId: string }) {
  const { data: session } = useSession();
  const query = useQuery({ queryKey: ['cover', session?.user.id, bookId], queryFn: () => api.get<{ cover: SavedCover }>(`/books/${bookId}/cover`), enabled: !!session });
  if (query.error) return <p role="alert" className="p-6">{errorMessage(query.error)} <Button onClick={() => void query.refetch()}>Retry</Button></p>;
  if (!query.data || !session) return <p role="status" className="p-6">Loading cover studio…</p>;
  return <CoverWorkspace key={`${session.user.id}:${bookId}`} bookId={bookId} ownerId={session.user.id} initial={query.data.cover} />;
}
function CoverWorkspace({ bookId, ownerId, initial }: { bookId: string; ownerId: string; initial: SavedCover }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [baseVersion, setBaseVersion] = useState(initial.version);
  const [steps, setSteps] = useState<CoverDesign[]>([initial.data]);
  const [position, setPosition] = useState(0);
  const data = steps[position];
  const [layer, setLayer] = useState<LayerKey>('title');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discardConflict, setDiscardConflict] = useState(false);
  const [comparison, setComparison] = useState<SavedCover | null>(null);
  const [picker, setPicker] = useState(false);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState<SavedCover | null>(null);
  const dirty = JSON.stringify(data) !== JSON.stringify(saved.data);
  const draftKey = `ebook-cover:${ownerId}:${bookId}`;
  const preview = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.25);
  const drag = useRef<{ x: number; y: number; key: LayerKey } | null>(null);
  function change(next: CoverDesign) { setSteps([...steps.slice(0, position + 1), next].slice(-50)); setPosition(Math.min(position + 1, 49)); setNotice(''); }
  function changeLayer(patch: Partial<CoverText>) { change({ ...data, [layer]: { ...data[layer], ...patch } }); }
  function forgetDraft() { try { sessionStorage.removeItem(draftKey); } catch { setStorageWarning('Browser draft storage is unavailable. Download a draft backup before leaving.'); } }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) { const parsed = JSON.parse(raw) as SavedCover; if (Number.isInteger(parsed.version) && parsed.version >= 0) setRecovery({ version: parsed.version, data: coverDesignSchema.parse(parsed.data) }); }
      } catch { setStorageWarning('Browser draft could not be read. Keep a downloaded draft backup.'); }
      setReady(true);
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!ready || recovery) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ version: baseVersion, data }));
        else sessionStorage.removeItem(draftKey);
      } catch { setStorageWarning('Browser draft storage is unavailable. Download a draft backup before leaving.'); }
    });
    return () => { active = false; };
  }, [ready, recovery, dirty, draftKey, baseVersion, data]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const navigate = (e: MouseEvent) => { const link = (e.target as Element)?.closest?.('a'); if (link?.href && !link.download && !window.confirm('Leave with unsaved cover changes? Your browser draft is kept when storage is available.')) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  useEffect(() => {
    const element = preview.current; if (!element) return;
    const observer = new ResizeObserver(entries => setScale(entries[0].contentRect.width / COVER_WIDTH)); observer.observe(element); return () => observer.disconnect();
  }, []);
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const parsed = coverDesignSchema.safeParse(data);
      if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('. '));
      const result = await api.put<{ cover: SavedCover }>(`/books/${bookId}/cover`, { baseVersion, data: parsed.data });
      setSaved(result.cover); setSteps(current => current.map((step, index) => index === position ? result.cover.data : step)); setBaseVersion(result.cover.version); setConflict(false); setComparison(null); forgetDraft(); setNotice(`Cover saved as version ${result.cover.version}.`);
      void qc.invalidateQueries({ queryKey: ['cover', ownerId, bookId] });
    } catch (e) { setError(errorMessage(e)); if (typeof e === 'object' && e && 'status' in e && e.status === 409) setConflict(true); } finally { setBusy(false); }
  }
  async function resolve(keep: boolean) {
    setBusy(true); setError('');
    try { const latest = (await api.get<{ cover: SavedCover }>(`/books/${bookId}/cover`)).cover; setSaved(latest); setBaseVersion(latest.version); setComparison(keep ? latest : null); if (!keep) { setSteps([latest.data]); setPosition(0); forgetDraft(); } setConflict(false); setNotice(keep ? 'Your draft is retained. Review it against the latest version before saving.' : 'Loaded the saved cover.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/v1/books/${bookId}/cover/render?version=${saved.version}`, { credentials: 'include' });
      if (!response.ok) throw new Error((await response.json()).error?.message ?? 'Cover rendering failed');
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `cover-v${saved.version}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Downloaded the saved 1600 × 2560 cover.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function move(key: LayerKey, dx: number, dy: number) {
    const t = data[key]; change({ ...data, [key]: { ...t, x: Math.max(.04, Math.min(.96 - t.width, t.x + dx)), y: Math.max(.025, Math.min(.975 - t.height, t.y + dy)) } });
  }
  const disabled = busy || !ready || !!recovery;
  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <style>{COVER_FONTS.map(font => `@font-face{font-family:${font};src:url('/api/v1/cover-fonts/${font}') format('truetype');font-weight:100 900;font-display:block}`).join('\n')}</style>
    <div><PageHeader title="Cover & illustration studio" description="Artwork and editable typography are separate. Changing text costs no image credits. Front cover only; print spine and back-cover layouts come later." /></div>
    {error && <Alert tone="danger">{error}</Alert>}
    {notice && <Alert tone="success">{notice}</Alert>}
    {storageWarning && <Alert tone="warning">{storageWarning}</Alert>}
    {recovery && <Alert tone="info" className="flex flex-wrap items-center gap-2"><span>Unsaved cover draft found (version {recovery.version}).</span><Button size="sm" onClick={() => { setSteps([recovery.data]); setPosition(0); setBaseVersion(recovery.version); setRecovery(null); }}>Recover cover draft</Button> <Button size="sm" variant="secondary" onClick={() => { forgetDraft(); setRecovery(null); }}>Discard cover draft</Button></Alert>}
    {conflict && <Alert tone="warning" className="flex flex-wrap items-center gap-2"><span>This cover was changed elsewhere. Choose how to continue.</span><Button size="sm" disabled={busy} onClick={() => void resolve(true)}>Keep draft and review latest version</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDiscardConflict(true)}>Load saved cover</Button></Alert>}
    <ConfirmDialog
      open={discardConflict}
      onClose={() => setDiscardConflict(false)}
      onConfirm={() => {
        setDiscardConflict(false);
        void resolve(false);
      }}
      title="Discard your cover edits?"
      description="The saved cover will be loaded and your browser draft will be dropped."
      confirmLabel="Load saved cover"
    >
      <p>The cover you saved earlier replaces the version currently on screen. This cannot be undone.</p>
    </ConfirmDialog>
    {comparison && <aside className="rounded border border-border p-4"><p className="font-semibold">Latest saved text (version {comparison.version})</p>{layerKeys.map(key => <p key={key} className="mt-2 text-sm"><strong>{key}:</strong> {comparison.data[key].text || '(empty)'} · {comparison.data[key].font} · position {Math.round(comparison.data[key].x * 100)}%, {Math.round(comparison.data[key].y * 100)}%</p>)}<p className="mt-2 text-sm">Your editable draft remains below. Saving creates a new version; the existing version is retained.</p></aside>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={disabled || conflict || (!dirty && saved.version > 0)} onClick={() => void save()}>Save cover</Button>
      <Button variant="secondary" disabled={disabled || dirty || !saved.version} onClick={() => void download()}>Download cover JPG</Button>
      <Button variant="secondary" disabled={disabled || position === 0} onClick={() => setPosition(p => p - 1)}>Undo</Button>
      <Button variant="secondary" disabled={disabled || position === steps.length - 1} onClick={() => setPosition(p => p + 1)}>Redo</Button>
      <Button variant="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: baseVersion, data }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'cover-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Backup draft</Button>
      <span role="status" className="self-center text-sm">{dirty ? 'Unsaved cover changes' : `Saved version ${saved.version}`}</span>
    </div>
    <div className="grid gap-8 lg:grid-cols-2">
      <div><div ref={preview} className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: `${COVER_WIDTH}/${COVER_HEIGHT}` }} aria-label="Cover preview">
        <div style={{ width: COVER_WIDTH, height: COVER_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative', background: data.background }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {data.artworkId && <img src={imageUrl(data.artworkId)} alt="Selected cover artwork" draggable={false} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${data.shade})` }} />
          {layerKeys.map(key => <div key={key} role="button" tabIndex={disabled ? -1 : 0} aria-label={`Move ${key} text`} style={{ ...coverTextStyle(data[key]), outline: layer === key ? '3px dashed #56b8ff' : undefined, cursor: 'move', touchAction: 'none', overflow: 'hidden' }} onFocus={() => setLayer(key)} onKeyDown={e => {
            if (disabled) return; const d = .005; const delta: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }; if (delta[e.key]) { e.preventDefault(); move(key, ...delta[e.key]); }
          }} onPointerDown={e => { if (disabled) return; setLayer(key); drag.current = { x: e.clientX, y: e.clientY, key }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current?.key === key) e.currentTarget.style.transform = `translate(${(e.clientX - drag.current.x) / scale}px,${(e.clientY - drag.current.y) / scale}px)`; }} onPointerCancel={e => { drag.current = null; e.currentTarget.style.transform = ''; }} onPointerUp={e => { if (!drag.current) return; const start = drag.current; drag.current = null; e.currentTarget.style.transform = ''; move(key, (e.clientX - start.x) / scale / COVER_WIDTH, (e.clientY - start.y) / scale / COVER_HEIGHT); }}>{data[key].text}</div>)}
        </div>
      </div><p className="mt-2 text-xs text-muted-foreground">Drag text or use arrow keys/numeric fields. Dashed selection guides are not exported. Artwork is cropped to fill. Check the downloaded cover for typography and image quality.</p></div>
      <fieldset disabled={disabled} className="min-w-0 space-y-4">
        <div className="flex gap-2"><Button variant="secondary" disabled={disabled} onClick={() => setPicker(true)}>Choose artwork</Button><Button variant="secondary" disabled={disabled || !data.artworkId} onClick={() => change({ ...data, artworkId: null })}>Remove artwork</Button></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Background" htmlFor="cover-background">
            <Input id="cover-background" aria-label="Cover background" type="color" className="h-11 p-1" value={data.background} onChange={e => change({ ...data, background: e.target.value })} />
          </Field>
          <Field label="Dark overlay" htmlFor="cover-shade">
            <Input id="cover-shade" aria-label="Dark overlay" type="range" min="0" max="0.85" step="0.05" className="mt-1 h-11 w-full accent-primary" value={data.shade} onChange={e => change({ ...data, shade: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Text layer" htmlFor="cover-layer">
          <Select id="cover-layer" aria-label="Text layer" value={layer} onChange={e => setLayer(e.target.value as LayerKey)}>{layerKeys.map(key => <option key={key}>{key}</option>)}</Select>
        </Field>
        <Field label={`${layer} text`} htmlFor={`cover-${layer}-text`}>
          <Textarea id={`cover-${layer}-text`} aria-label={`${layer} text`} maxLength={300} className="min-h-16" value={data[layer].text} onChange={e => changeLayer({ text: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font" htmlFor="cover-font">
            <Select id="cover-font" aria-label="Font" value={data[layer].font} onChange={e => changeLayer({ font: e.target.value as CoverText['font'] })}>{COVER_FONTS.map(font => <option key={font}>{font}</option>)}</Select>
          </Field>
          <Field label="Text color" htmlFor="cover-color">
            <Input id="cover-color" aria-label="Text color" type="color" className="h-11 p-1" value={data[layer].color} onChange={e => changeLayer({ color: e.target.value })} />
          </Field>
          <Field label="Weight" htmlFor="cover-weight">
            <Select id="cover-weight" aria-label="Weight" value={data[layer].weight} onChange={e => changeLayer({ weight: e.target.value as CoverText['weight'] })}><option value="400">Regular</option><option value="700">Bold</option></Select>
          </Field>
          <Field label="Alignment" htmlFor="cover-align">
            <Select id="cover-align" aria-label="Alignment" value={data[layer].align} onChange={e => changeLayer({ align: e.target.value as CoverText['align'] })}>{['left', 'center', 'right'].map(value => <option key={value}>{value}</option>)}</Select>
          </Field>
          <Field label="Direction" htmlFor="cover-direction">
            <Select id="cover-direction" aria-label="Direction" value={data[layer].direction} onChange={e => changeLayer({ direction: e.target.value as CoverText['direction'] })}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></Select>
          </Field>
          {(['x', 'y', 'width', 'height', 'size'] as const).map(key => (
            <Field key={key} label={`${key} (%)`} htmlFor={`cover-${key}`}>
              <Input id={`cover-${key}`} aria-label={`${key} percent`} type="number" className="h-11" min={key === 'size' ? 1.2 : key === 'width' ? 10 : key === 'x' ? 4 : key === 'y' ? 2.5 : 3} max={key === 'size' ? 15 : key === 'height' ? 50 : 96} step="0.1" value={Math.round(data[layer][key] * 1000) / 10} onChange={e => changeLayer({ [key]: Number(e.target.value) / 100 })} />
            </Field>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Use the matching Noto family for Bengali, Arabic or Devanagari. Other scripts need a font coverage review. Text that overflows its box is rejected at export.</p>
        <p className="text-sm" role="status">{contrastAgainstBackground(data[layer].color, data.background, data.shade) < 3 ? 'Low contrast against the flat background. Change the text color or overlay. ' : ''}Estimated flat-background contrast: {contrastAgainstBackground(data[layer].color, data.background, data.shade).toFixed(1)}:1. Review contrast over actual artwork separately.</p>
        <details><summary className="cursor-pointer font-semibold">Book visual direction</summary>
          <Field label="Style" htmlFor="cover-style">
            <Select id="cover-style" aria-label="Style" value={data.visual.style} onChange={e => change({ ...data, visual: { ...data.visual, style: e.target.value as CoverDesign['visual']['style'] } })}>{['editorial', 'watercolor', 'photographic', 'minimal'].map(style => <option key={style}>{style}</option>)}</Select>
          </Field>
          {(['palette', 'characters', 'direction'] as const).map(key => (
            <Field key={key} label={key} htmlFor={`cover-visual-${key}`}>
              <Textarea id={`cover-visual-${key}`} aria-label={key} className="min-h-16" maxLength={key === 'palette' ? 200 : 1000} value={data.visual[key]} onChange={e => change({ ...data, visual: { ...data.visual, [key]: e.target.value } })} />
            </Field>
          ))}
          <p className="text-xs">Save these settings before generating. Shared prompts encourage consistency but cannot guarantee identical characters or style.</p>
        </details>
      </fieldset>
    </div>
    <ImageGenerator bookId={bookId} disabled={disabled || dirty || !saved.version} selectArtwork={id => change({ ...data, artworkId: id })} />
    <Dialog open={picker} onClose={() => setPicker(false)} title="Choose or upload artwork" className="max-w-4xl"><AssetLibrary key={ownerId} onInsert={asset => { change({ ...data, artworkId: asset.id }); setPicker(false); }} /></Dialog>
  </div>;
}
function ImageGenerator({ bookId, disabled, selectArtwork }: { bookId: string; disabled: boolean; selectArtwork: (id: string) => void }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(''); const [purpose, setPurpose] = useState<'cover' | 'illustration'>('cover');
  const [aspect, setAspect] = useState<'portrait' | 'square' | 'landscape'>('portrait');
  const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const config = useQuery({ queryKey: ['image-config'], queryFn: () => api.get<{ credits: number; model: string; mock: boolean; enabled: boolean }>('/image-config') });
  const history = useQuery({ queryKey: ['image-jobs', bookId, cursor], queryFn: () => api.get<{ jobs: ImageJob[]; nextCursor: string | null }>(`/books/${bookId}/images${cursor ? `?cursor=${cursor}` : ''}`), refetchInterval: q => q.state.data?.jobs.some(j => ['queued', 'running'].includes(j.status)) ? 1500 : false });
  useEffect(() => { void qc.invalidateQueries({ queryKey: qk.credits }); void qc.invalidateQueries({ queryKey: ['assets'] }); }, [history.data, qc]);
  const active = history.data?.jobs.some(j => ['queued', 'running'].includes(j.status));
  return <section className="space-y-4 border-t border-border pt-6"><h2 className="text-xl font-semibold">Generate artwork</h2>
    <p className="text-sm">{config.data ? `${config.data.credits} credits per image. ${config.data.mock ? 'Mock mode: produces a test image.' : `Model: ${config.data.model}.`}` : 'Loading image pricing…'} Credits are reserved when queued and charged only for a saved result. Save cover changes before generating.</p>
    {config.error && <Alert tone="danger">{errorMessage(config.error)}</Alert>}
    {config.data && !config.data.enabled && <Alert tone="warning">Image generation is not configured. You can upload your own artwork.</Alert>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Purpose" htmlFor="image-purpose">
        <Select id="image-purpose" aria-label="Image purpose" value={purpose} onChange={e => { setPurpose(e.target.value as typeof purpose); if (e.target.value === 'cover') setAspect('portrait'); }}><option value="cover">Cover concept</option><option value="illustration">Interior illustration</option></Select>
      </Field>
      <Field label="Aspect" htmlFor="image-aspect">
        <Select id="image-aspect" aria-label="Image aspect" value={aspect} disabled={purpose === 'cover'} onChange={e => setAspect(e.target.value as typeof aspect)}>{['portrait', 'square', 'landscape'].map(a => <option key={a}>{a}</option>)}</Select>
      </Field>
    </div>
    <Field label="Artwork prompt" htmlFor="artwork-prompt" hint="At least 10 characters. Describe the scene, subject and mood.">
      <Textarea id="artwork-prompt" aria-label="Artwork prompt" className="min-h-24" minLength={10} maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the scene, subject and mood. Text is added separately." />
    </Field>
    <Button disabled={disabled || busy || active || !config.data?.enabled || prompt.trim().length < 10} onClick={async () => {
      setBusy(true); setError(''); try { await operationRequest(`/books/${bookId}/images`, { purpose, prompt, aspect, expectedCredits: config.data!.credits }); setCursor(null); await qc.invalidateQueries({ queryKey: ['image-jobs', bookId] }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
    }}>Generate image{config.data ? ` · ${config.data.credits} credits` : ''}</Button>
    {(error || history.error) && <p role="alert" className="text-danger">{error || errorMessage(history.error)}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{history.data?.jobs.map(job => <article key={job.id} className="space-y-2 rounded border border-border p-3">
      <p className="font-semibold">{job.input.request.purpose} · {job.cancelRequested && ['queued', 'running'].includes(job.status) ? 'Cancelling…' : job.status}</p>
      <p className="text-sm">{job.input.request.prompt}</p>
      {job.status === 'completed' && job.assetId && <>
      {/* Authenticated media bypasses the public image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(job.assetId)} alt="Generated artwork concept" className="h-48 w-full object-contain" /><Button variant="secondary" disabled={disabled} onClick={() => selectArtwork(job.assetId!)}>Use as cover artwork</Button><p className="text-xs">Also available in the editor’s image library. Add descriptive alt text before inserting.</p></>}
      {['queued', 'running'].includes(job.status) && <Button variant="secondary" disabled={job.cancelRequested || busy} onClick={async () => { setBusy(true); setError(''); try { await api.post(`/books/${bookId}/images/${job.id}/cancel`); await history.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>Cancel image</Button>}
      {job.error && <p className="text-sm" role="alert">{job.error}</p>}<p className="text-xs">{job.creditsCharged} credits charged · Reference {job.id}</p>
    </article>)}</div>
    <div className="flex gap-2"><Button variant="secondary" onClick={() => { setCursor(null); void history.refetch(); }}>Latest / refresh</Button><Button variant="secondary" disabled={!history.data?.nextCursor} onClick={() => setCursor(history.data?.nextCursor ?? null)}>Older concepts</Button></div>
  </section>;
}
