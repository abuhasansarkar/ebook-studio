"use client";
import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BOOK_TYPES, BOOK_TYPE_LABELS, BOOK_STATUSES, LANGUAGES } from '@ebook/shared';
import { PageHeader } from '@/components/app/app-shell';
import { BookCard, STATUS_META } from '@/components/books/book-card';
import { BookOrganization, useProjects } from '@/components/books/library-tools';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { ErrorState, PageLoader } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import type { BookSummary } from '@/lib/types';
function Library() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const projects = useProjects('archived=all&limit=100');
  const books = useQuery({ queryKey: ['books', 'library', query], queryFn: () => api.get<{ books: BookSummary[]; nextCursor: string | null }>(`/books?${query}`) });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'cursor') next.delete('cursor');
    router.replace(`/app/books?${next.toString()}`, { scroll: false });
  };
  const select = (key: string, label: string, options: { value: string; label: string }[]) => <label className="text-xs">{label}<select aria-label={label} value={params.get(key) ?? ''} onChange={e => set(key, e.target.value)} className="mt-1 block max-w-52 rounded border border-border bg-surface p-2 text-sm">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
    <PageHeader title="My eBooks" description="Organize your books and find archived work." actions={<div className="flex gap-2"><Link href="/app/projects" className={buttonVariants({ variant: 'secondary' })}>Projects</Link><Link href="/app/create" className={buttonVariants()}>New eBook</Link></div>} />
    <form className="mb-4 flex gap-2" key={params.get('search') ?? ''} onSubmit={e => { e.preventDefault(); set('search', String(new FormData(e.currentTarget).get('search') ?? '').trim()); }}><Input name="search" aria-label="Search books" placeholder="Search by title" defaultValue={params.get('search') ?? ''} maxLength={200} /><Button type="submit" variant="secondary">Search</Button></form>
    <div className="mb-6 flex flex-wrap gap-3">
      {select('archived', 'Archive filter', [{ value: '', label: 'Active books' }, { value: 'archived', label: 'Archived books' }, { value: 'all', label: 'All books' }])}
      {select('projectId', 'Project filter', [{ value: '', label: 'All projects' }, { value: '_none', label: 'No project' }, ...(projects.data?.projects.map(p => ({ value: p.id, label: p.name })) ?? [])])}
      {select('language', 'Language filter', [{ value: '', label: 'All languages' }, ...LANGUAGES.map(l => ({ value: l.code, label: l.name }))])}
      {select('bookType', 'Book type filter', [{ value: '', label: 'All types' }, ...BOOK_TYPES.map(t => ({ value: t, label: BOOK_TYPE_LABELS[t] }))])}
      {select('status', 'Status filter', [{ value: '', label: 'All statuses' }, ...BOOK_STATUSES.map(t => ({ value: t, label: STATUS_META[t].label }))])}
      {select('sort', 'Sort books', [{ value: '', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'title', label: 'Title A–Z' }])}
      <Button variant="ghost" onClick={() => router.replace('/app/books')}>Clear filters</Button>
    </div>
    {books.isLoading ? <PageLoader /> : books.error ? <ErrorState message={errorMessage(books.error)} onRetry={() => params.get('cursor') ? set('cursor', '') : void books.refetch()} /> : <>
      {!books.data?.books.length && <p>No books match these filters.</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.data?.books.map(b => <div key={b.id}><BookCard book={b} /><BookOrganization book={b} /></div>)}</div>
      <div className="mt-6 flex gap-2"><Button variant="secondary" disabled={!params.get('cursor')} onClick={() => set('cursor', '')}>First page</Button><Button variant="secondary" disabled={!books.data?.nextCursor} onClick={() => set('cursor', books.data!.nextCursor!)}>Next books</Button></div>
    </>}
  </div>;
}
export default function BooksPage() { return <Suspense fallback={<PageLoader />}><Library /></Suspense>; }
