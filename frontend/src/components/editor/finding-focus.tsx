"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { locateAnchor, textBlocks, type TextAnchor } from '@ebook/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { findingHighlightKey, rangeForBlock } from './finding-highlight';

type FocusFinding = { id: string; message: string; status: string; anchor: TextAnchor | null; suggestion: { replacement?: string; advice?: string } | null; report: { bookId: string } };

/** Highlights a quality finding in the open chapter. Fixes are ordinary edits, saved by autosave with history and OCC. */
export function FindingFocus({ editor, findingId, bookId, editable }: { editor: Editor | null; findingId: string; bookId: string; editable: boolean }) {
  const qc = useQueryClient();
  const finding = useQuery({ queryKey: ['quality-finding', findingId], queryFn: () => api.get<{ finding: FocusFinding }>(`/quality/findings/${findingId}`).then(r => r.finding) });
  const [located, setLocated] = useState<'pending' | 'found' | 'missing'>('pending');
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [state, setState] = useState({ busy: false, error: '', done: '' });

  useEffect(() => {
    const anchor = finding.data?.anchor;
    if (!editor || !anchor) return;
    // Locate in the live document so unsaved local edits are respected.
    const location = locateAnchor(textBlocks(editor.getJSON()), anchor);
    const found = location.status === 'missing' ? null : rangeForBlock(editor.state.doc, location.block, location.start, location.end);
    queueMicrotask(() => { setLocated(found ? 'found' : 'missing'); setRange(found); });
    editor.view.dispatch(editor.state.tr.setMeta(findingHighlightKey, found));
    if (found) {
      editor.commands.setTextSelection(found);
      requestAnimationFrame(() => (editor.view.domAtPos(found.from).node as HTMLElement | null)?.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    return () => { if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(findingHighlightKey, null)); };
  }, [editor, finding.data]);

  async function markResolved(note: string) {
    await api.patch(`/quality/findings/${findingId}`, { status: 'resolved', note });
    void qc.invalidateQueries({ queryKey: ['quality-report', bookId] }); void qc.invalidateQueries({ queryKey: ['quality-finding', findingId] });
  }
  async function apply() {
    const replacement = finding.data?.suggestion?.replacement;
    if (!editor || !range || !replacement) return;
    setState({ busy: true, error: '', done: '' });
    try {
      editor.chain().focus().insertContentAt(range, replacement).run(); // normal edit → autosave, history, OCC
      editor.view.dispatch(editor.state.tr.setMeta(findingHighlightKey, null));
      setRange(null);
      await markResolved(`Applied the suggested replacement “${replacement}” in the editor.`);
      setState({ busy: false, error: '', done: 'Replacement applied. It is saved like any other edit; undo with Ctrl/Cmd+Z.' });
    } catch (e) { setState({ busy: false, error: errorMessage(e), done: '' }); }
  }
  if (finding.error) return <Alert tone="danger" className="mx-4 mt-4">{errorMessage(finding.error)}</Alert>;
  if (!finding.data) return null;
  const f = finding.data;
  return <Alert tone={located === 'missing' ? 'warning' : 'info'} className="mx-4 mt-4">
    <p className="font-semibold">Quality finding: {f.message}</p>
    {located === 'missing' && <p className="mt-1">The quoted text is no longer in this chapter, so nothing is highlighted. It may already be fixed. Run the checks again to confirm.</p>}
    {located === 'found' && <p className="mt-1">The passage is highlighted and selected. Edit it as usual; your changes save with normal version history.</p>}
    {f.suggestion?.advice && <p className="mt-1">Suggestion: {f.suggestion.advice}</p>}
    {state.error && <p role="alert" className="mt-1 text-danger">{state.error}</p>}
    {state.done && <p className="mt-1">{state.done}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {f.suggestion?.replacement && range && <Button size="sm" disabled={!editable || state.busy} onClick={() => void apply()}>Replace with “{f.suggestion.replacement}”</Button>}
      {f.status === 'open' && !state.done && <Button size="sm" variant="secondary" disabled={state.busy} onClick={() => void markResolved('Fixed in the manuscript.').then(() => setState({ busy: false, error: '', done: 'Marked as resolved.' }), e => setState({ busy: false, error: errorMessage(e), done: '' }))}>Mark resolved</Button>}
      <Link className="self-center text-sm font-semibold underline" href={`/app/books/${bookId}/quality`}>Back to review</Link>
    </div>
  </Alert>;
}
