"use client";
import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { BookBriefInput } from '@ebook/shared';
import { useSession } from '@/lib/auth-client';
import { planningDraftKey, listPlanningDrafts, writePlanningDraft, deletePlanningDrafts } from '@/lib/planning-draft';

/** Brief autosave. Drafts are found by account (not by tab), so a brief left in a
 * crashed or closed tab is offered for recovery in the next one. */

export function usePlanningDraft(form: UseFormReturn<BookBriefInput>) {
  const { data: session } = useSession();
  const [recovery, setRecovery] = useState<BookBriefInput | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const owner = useRef<string | null>(null);
  // Records offered for recovery: removed once recovered (this tab's own record
  // takes over) or discarded, so they do not linger as orphans.
  const found = useRef<string[]>([]);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const paused = useRef(true);
  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    const read = async () => {
      try {
        owner.current = session.user.id;
        key.current = planningDraftKey(session.user.id);
        const drafts = await listPlanningDrafts(session.user.id);
        const draft = drafts[0]?.value ?? null;
        if (active) { found.current = drafts.map(d => d.key); setRecovery(draft); paused.current = !!draft; }
      } catch { if (active) { setError('Planning recovery is unavailable in this browser.'); paused.current = false; } }
      finally { if (active) setReady(true); }
    };
    void read();
    return () => { active = false; paused.current = true; };
  }, [session?.user.id]);
  useEffect(() => {
    const subscription = form.watch(values => {
      if (paused.current || !key.current || !owner.current) return;
      const id = key.current;
      const ownerId = owner.current;
      const copy = structuredClone(values) as BookBriefInput;
      writes.current = writes.current.then(() => writePlanningDraft(id, copy, ownerId)).catch(() => setError('Planning recovery is unavailable in this browser.'));
    });
    return () => subscription.unsubscribe();
  }, [form]);
  const recover = () => {
    if (recovery) form.reset(recovery);
    setRecovery(null);
    paused.current = false;
    // This tab now holds the recovered brief under its own key; drop the others.
    const others = found.current.filter(k => k !== key.current);
    found.current = [];
    if (key.current && recovery) {
      const id = key.current;
      const ownerId = owner.current;
      const copy = structuredClone(recovery);
      writes.current = writes.current.then(async () => {
        if (ownerId) await writePlanningDraft(id, copy, ownerId);
        await deletePlanningDrafts(others);
      }).catch(() => setError('Planning recovery is unavailable in this browser.'));
    }
  };
  const clear = async () => {
    paused.current = true;
    const keys = [...found.current, ...(key.current ? [key.current] : [])];
    found.current = [];
    if (keys.length) {
      writes.current = writes.current.then(() => deletePlanningDrafts(keys));
      try { await writes.current; } catch { setError('Could not clear the saved planning draft.'); }
    }
    setRecovery(null);
  };
  const discard = async () => { await clear(); paused.current = false; };
  return { recovery, ready, error, recover, discard, clear };
}
