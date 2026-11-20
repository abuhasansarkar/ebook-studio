"use client";

import { useRef, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/app-shell';

export interface ImageAsset { id: string; width: number; height: number; bytes: number; alt: string; caption: string; _count: { references: number } }
export const imageUrl = (id: string) => `/api/v1/assets/${encodeURIComponent(id)}/content`;

function AssetCard({ asset, onInsert, onChanged }: { asset: ImageAsset; onInsert?: (asset: ImageAsset) => void; onChanged: () => void }) {
  const [alt, setAlt] = useState(asset.alt);
  const [caption, setCaption] = useState(asset.caption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { await api.patch(`/assets/${asset.id}`, { alt, caption }); onChanged(); setMessage('Details saved. Existing chapter captions stay unchanged.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <article className="space-y-3 rounded-xl border border-border p-4">
    {/* Authenticated private images must bypass the public image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={imageUrl(asset.id)} alt={alt} loading="lazy" className="h-40 w-full rounded-lg bg-muted object-contain" />
    <p className="text-xs text-muted-foreground">{asset.width} × {asset.height} · {(asset.bytes / 1024).toFixed(0)} KiB · {asset._count.references ? 'Retained for manuscript history' : 'Not yet saved in a manuscript'}</p>
    <label className="block text-sm">Alternative text<input className="mt-1 w-full rounded border border-border p-2" value={alt} maxLength={500} onChange={e => setAlt(e.target.value)} placeholder="Describe it, or leave empty if decorative" /></label>
    <label className="block text-sm">Caption<textarea className="mt-1 w-full rounded border border-border p-2" value={caption} maxLength={1000} onChange={e => setCaption(e.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save()}>Save details</Button>
      {onInsert && <Button size="sm" disabled={busy} onClick={() => onInsert({ ...asset, alt, caption })}>Insert image</Button>}
      <Button size="sm" variant="danger" disabled={busy || asset._count.references > 0} onClick={async () => {
        if (!window.confirm('Delete this image permanently? Unsaved browser drafts using it will lose access.')) return;
        setBusy(true); setError('');
        try { await api.delete(`/assets/${asset.id}`); onChanged(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
      }}>Delete image</Button>
    </div>
  </article>;
}

export function AssetLibrary({ onInsert }: { onInsert?: (asset: ImageAsset) => void }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => { upload.current?.abort(); }, []);
  const query = useQuery({ queryKey: ['assets', session?.user.id, cursor], enabled: !!session?.user.id, queryFn: () => api.get<{ assets: ImageAsset[]; nextCursor: string | null }>(`/assets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['assets'] }); };
  function send(file: File) {
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) { setError('Choose a PNG, JPEG or WebP up to 10 MiB.'); return; }
    const xhr = new XMLHttpRequest(); upload.current = xhr;
    xhr.open('POST', '/api/v1/assets'); xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type); xhr.timeout = 90000;
    setProgress(0);
    xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)); };
    const done = () => { setProgress(null); upload.current = null; if (input.current) input.current.value = ''; };
    xhr.onload = () => {
      if (xhr.status === 201) { setCursor(null); refresh(); }
      else { let message = 'Upload failed. Please retry.'; try { message = JSON.parse(xhr.responseText).error?.message ?? message; } catch {} setError(message); }
      done();
    };
    xhr.onerror = xhr.ontimeout = () => { setError('Upload could not be confirmed. Refresh the library before retrying.'); refresh(); done(); };
    xhr.onabort = done;
    xhr.send(file);
  }
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Private PNG, JPEG or WebP images. Maximum 10 MiB, 24 megapixels and 10,000 pixels per side. Still images only. Upload images you have permission to publish.</p>
    <label className="block text-sm font-medium">Upload image<input ref={input} className="mt-2 block w-full rounded border border-border p-3" type="file" accept="image/png,image/jpeg,image/webp" disabled={progress !== null || !session} onChange={e => { const file = e.target.files?.[0]; if (file) send(file); }} /></label>
    {progress !== null && <div role="status"><progress value={progress} max={100} className="w-full" aria-label="Upload progress" />{progress < 100 ? `Uploading ${progress}%` : 'Validating and processing image…'}</div>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {query.isPending && <p role="status">Loading images…</p>}
    {query.error && <p role="alert">{errorMessage(query.error)}</p>}
    <Button variant="secondary" size="sm" onClick={refresh}>Refresh images</Button>
    {query.data?.assets.length === 0 && <p>No images on this page. Upload an image to begin.</p>}
    <div className="grid gap-4 sm:grid-cols-2">{query.data?.assets.map(asset => <AssetCard key={asset.id} asset={asset} onInsert={onInsert} onChanged={refresh} />)}</div>
    <div className="flex gap-2"><Button variant="secondary" disabled={!cursor} onClick={() => setCursor(null)}>First page</Button><Button variant="secondary" disabled={!query.data?.nextCursor} onClick={() => setCursor(query.data?.nextCursor ?? null)}>Next page</Button></div>
  </div>;
}
export function ImageStudio() {
  const { data: session } = useSession();
  return <div className="mx-auto max-w-5xl p-6 sm:p-10"><PageHeader title="Image library" description="Upload and describe images for your books. Saved manuscript images are retained for revision history." /><AssetLibrary key={session?.user.id ?? 'loading'} /></div>;
}
