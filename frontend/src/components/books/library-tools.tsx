"use client";
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { Card, ErrorState, PageLoader } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import type { BookSummary } from '@/lib/types';

interface Project { id: string; name: string; description: string | null; archivedAt: string | null; _count: { books: number } }
export function useProjects(query = 'limit=100') {
  return useQuery({ queryKey: ['projects', query], queryFn: () => api.get<{ projects: Project[]; nextCursor: string | null }>(`/projects?${query}`) });
}
export function BookOrganization({ book }: { book: BookSummary }) {
  const qc = useQueryClient();
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const change = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action(); setCopyOpen(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ['books'] }), qc.invalidateQueries({ queryKey: ['projects'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['book', book.id] })]);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="space-y-2 rounded-b-xl border border-border bg-surface p-3">
    <label className="block text-xs">Project
      <select aria-label={`Project for ${book.title}`} className="mt-1 w-full rounded border border-border bg-surface p-2" value={book.projectId ?? ''} disabled={busy || projects.isLoading || !!projects.error} onChange={e => void change(() => api.patch(`/books/${book.id}`, { projectId: e.target.value || null }))}>
        <option value="">No project</option>
        {book.projectId && !projects.data?.projects.some(p => p.id === book.projectId) && <option value={book.projectId}>Current project (not in this list)</option>}
        {projects.data?.projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
      </select>
    </label>
    {projects.error && <button className="text-xs underline" onClick={() => void projects.refetch()}>Retry loading projects</button>}
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void change(() => api.patch(`/books/${book.id}`, { archived: !book.archivedAt }))}>{book.archivedAt ? 'Restore book' : 'Archive book'}</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCopyOpen(true)}>Duplicate</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (window.confirm(`Delete “${book.title}”? It will disappear from your library. Archive it instead if you want to restore it later.`)) void change(() => api.delete(`/books/${book.id}`)); }}>Delete</Button>
    </div>
    <Dialog open={copyOpen} onClose={() => !busy && setCopyOpen(false)} title="Duplicate book" description="Creates an independent book with new identities. Credits, exports, jobs and revision history are not copied. The copy starts outside any project.">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void change(() => api.post(`/books/${book.id}/duplicate`, { includeManuscript: false }))}>Copy brief and outline</Button>
        <Button disabled={busy} variant="secondary" onClick={() => void change(() => api.post(`/books/${book.id}/duplicate`, { includeManuscript: true }))}>Include manuscript</Button>
      </div>
    </Dialog>
  </div>;
}

export function ProjectManager() {
  const qc = useQueryClient();
  const [archived, setArchived] = useState('active');
  const [cursor, setCursor] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const projects = useProjects(new URLSearchParams({ archived, search, limit: '24', ...(cursor ? { cursor } : {}) }).toString());
  const change = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); setEditing(null); await qc.invalidateQueries({ queryKey: ['projects'] }); await qc.invalidateQueries({ queryKey: ['books'] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
    <h1 className="text-2xl font-bold">Projects</h1>
    <p className="text-sm text-muted-foreground">Group books by series, client or publishing idea. Archiving a project keeps its books in the library.</p>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => { setEditing('new'); setName(''); setDescription(''); }}>New project</Button>
      <Input className="max-w-xs" aria-label="Search projects" placeholder="Search projects" value={search} onChange={e => { setSearch(e.target.value); setCursor(''); }} />
      <select aria-label="Project archive filter" className="rounded border border-border bg-surface p-2" value={archived} onChange={e => { setArchived(e.target.value); setCursor(''); }}><option value="active">Active projects</option><option value="archived">Archived projects</option><option value="all">All projects</option></select>
    </div>
    {projects.isLoading ? <PageLoader /> : projects.error ? <ErrorState message={errorMessage(projects.error)} onRetry={() => cursor ? setCursor('') : void projects.refetch()} /> : <>
      {!projects.data?.projects.length && <p>No projects match these filters.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{projects.data?.projects.map(p => <Card key={p.id} className="space-y-3 p-5">
        <h2 className="text-lg font-semibold"><Link href={`/app/books?projectId=${encodeURIComponent(p.id)}&archived=all`}>{p.name}</Link></h2>
        <p className="whitespace-pre-wrap text-sm">{p.description}</p><p className="text-xs text-muted-foreground">{p._count.books} books · {p.archivedAt ? 'Archived' : 'Active'}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setEditing(p); setName(p.name); setDescription(p.description ?? ''); }}>Edit project</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void change(() => api.patch(`/projects/${p.id}`, { archived: !p.archivedAt }))}>{p.archivedAt ? 'Restore project' : 'Archive project'}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm('Delete this project? Its books will stay in the library without a project.')) void change(() => api.delete(`/projects/${p.id}`)); }}>Delete project</Button>
        </div>
      </Card>)}</div>
      <div className="flex gap-2"><Button variant="secondary" disabled={!cursor} onClick={() => setCursor('')}>First page</Button><Button variant="secondary" disabled={!projects.data?.nextCursor} onClick={() => setCursor(projects.data!.nextCursor!)}>Next projects</Button></div>
    </>}
    <Dialog open={!!editing} onClose={() => !busy && setEditing(null)} title={editing === 'new' ? 'New project' : 'Edit project'}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (editing) void change(() => editing === 'new' ? api.post('/projects', { name, description }) : api.patch(`/projects/${editing.id}`, { name, description })); }}>
        <label className="block">Name<Input aria-label="Project name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">Description<Textarea aria-label="Project description" maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <Button type="submit" loading={busy} disabled={!name.trim()}>Save project</Button>
      </form>
    </Dialog>
  </div>;
}
