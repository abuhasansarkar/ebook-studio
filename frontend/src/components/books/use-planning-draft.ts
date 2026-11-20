"use client";
import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { BookBriefInput } from '@ebook/shared';
import { useSession } from '@/lib/auth-client';
import { planningDraftKey, readPlanningDraft, writePlanningDraft, deletePlanningDraft } from '@/lib/planning-draft';

export function usePlanningDraft(form: UseFormReturn<BookBriefInput>) {
  const { data: session } = useSession();
  const [recovery, setRecovery] = useState<BookBriefInput | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const paused = useRef(true);
  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    const read = async () => {
      try {
        key.current = planningDraftKey(session.user.id);
        const draft = await readPlanningDraft(key.current);
        if (active) { setRecovery(draft); paused.current = !!draft; }
      } catch { if (active) { setError('Planning recovery is unavailable in this browser.'); paused.current = false; } }
      finally { if (active) setReady(true); }
    };
    void read();
    return () => { active = false; paused.current = true; };
  }, [session?.user.id]);
  useEffect(() => {
    const subscription = form.watch(values => {
      if (paused.current || !key.current) return;
      const id = key.current;
      const copy = structuredClone(values) as BookBriefInput;
      writes.current = writes.current.then(() => writePlanningDraft(id, copy)).catch(() => setError('Planning recovery is unavailable in this browser.'));
    });
    return () => subscription.unsubscribe();
  }, [form]);
  const recover = () => { if (recovery) form.reset(recovery); setRecovery(null); paused.current = false; };
  const clear = async () => {
    paused.current = true;
    if (key.current) {
      const id = key.current;
      writes.current = writes.current.then(() => deletePlanningDraft(id));
      try { await writes.current; } catch { setError('Could not clear the saved planning draft.'); }
    }
    setRecovery(null);
  };
  const discard = async () => { await clear(); paused.current = false; };
  return { recovery, ready, error, recover, discard, clear };
}
