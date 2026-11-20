"use client";

import type { Editor, JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { ASSIST_ACTION_LABELS, CREDIT_COSTS, type AssistAction } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/queries";

const PRIMARY: AssistAction[] = ["rewrite", "expand", "shorten", "proofread"];
const MORE: AssistAction[] = ["simplify", "professional", "conversational", "add_example", "to_bullets", "custom"];

interface Request {
  action: AssistAction;
  from: number;
  to: number;
  text: string;
  document: string;
  instruction?: string;
}

/** Selection bubble menu + suggestion dialog. Suggestions never replace text until accepted. */
export function AiAssist({ editor, bookId, dir }: { editor: Editor; bookId: string; dir: string }) {
  const qc = useQueryClient();
  const requestSequence = useRef(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [req, setReq] = useState<Request | null>(null);
  const [needsInstruction, setNeedsInstruction] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; content: JSONContent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (r: Request) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ text: string; content: JSONContent[] }>(
        "/ai/assist",
        { bookId, action: r.action, text: r.text, instruction: r.instruction },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      if (sequence === requestSequence.current) setResult(res);
    } catch (err) {
      if (sequence === requestSequence.current) setError(errorMessage(err));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
      void qc.invalidateQueries({ queryKey: qk.credits });
    }
  };

  const begin = (action: AssistAction) => {
    setMoreOpen(false);
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n\n").trim();
    if (!text) return;
    if (text.length > 8000) {
      window.alert('Select up to 8,000 characters. A longer selection cannot be replaced safely.');
      return;
    }
    const r = { action, from, to, text, document: JSON.stringify(editor.getJSON()) };
    setReq(r);
    if (action === "custom") {
      setNeedsInstruction(true);
      setInstruction("");
      setResult(null);
      setError(null);
    } else {
      setNeedsInstruction(false);
      void run(r);
    }
  };

  const close = () => {
    requestSequence.current++;
    setLoading(false);
    setReq(null);
    setResult(null);
    setError(null);
    setNeedsInstruction(false);
  };

  const accept = () => {
    if (!req || !result) return;
    if (!editor.isEditable || JSON.stringify(editor.getJSON()) !== req.document) {
      setError('The chapter changed while this suggestion was being prepared. Reject it and select the text again.');
      return;
    }
    const nodes = result.content;
    // A single paragraph replaces inline (keeps the surrounding paragraph intact).
    const content = nodes.length === 1 && nodes[0].type === "paragraph" ? nodes[0].content ?? [] : nodes;
    editor.chain().focus().insertContentAt({ from: req.from, to: req.to }, content).run();
    close();
  };

  return (
    <>
      <BubbleMenu editor={editor} shouldShow={({ editor: e, from, to }) => e.isEditable && to - from > 2 && !req} options={{ placement: "top" }}>
        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-lg">
          <span className="flex items-center gap-1 px-2 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI
          </span>
          {PRIMARY.map((a) => (
            <button key={a} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => begin(a)} className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
              {ASSIST_ACTION_LABELS[a]}
            </button>
          ))}
          <div className="relative">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMoreOpen((o) => !o)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted" aria-expanded={moreOpen}>
              More <ChevronDown className="h-3 w-3" />
            </button>
            {moreOpen && (
              <div className="absolute end-0 top-full z-20 mt-1 w-48 rounded-xl border border-border bg-surface p-1 shadow-lg" role="menu">
                {MORE.map((a) => (
                  <button key={a} type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => begin(a)} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-start text-xs hover:bg-muted">
                    {ASSIST_ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </BubbleMenu>

      <Dialog open={req !== null} onClose={close} title={req ? `AI: ${ASSIST_ACTION_LABELS[req.action]}` : "AI"} description={`Review the suggestion before it replaces your text. Each request uses ${CREDIT_COSTS.assist} credit.`} className="max-w-2xl">
        {needsInstruction && req && !result && !loading ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!instruction.trim()) return;
              const r = { ...req, instruction: instruction.trim() };
              setReq(r);
              setNeedsInstruction(false);
              void run(r);
            }}
          >
            <Textarea autoFocus rows={3} placeholder="e.g. Turn this into a short story with a real-life example" value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="Instruction for the AI" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={!instruction.trim()}>
                <Sparkles className="h-4 w-4" /> Generate
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original</p>
                <div dir={dir} className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm leading-relaxed">{req?.text}</div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">Suggestion</p>
                <div dir={dir} className="flex max-h-72 min-h-24 overflow-y-auto whitespace-pre-wrap rounded-xl border border-primary/30 bg-primary-soft/40 p-3 text-sm leading-relaxed">
                  {loading ? (
                    <span className="m-auto flex items-center gap-2 text-muted-foreground">
                      <Spinner className="h-4 w-4" /> Thinking…
                    </span>
                  ) : (
                    result?.text
                  )}
                </div>
              </div>
            </div>
            {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Reject
              </Button>
              <Button variant="secondary" disabled={loading || !req} onClick={() => req && void run(req)}>
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
              <Button disabled={loading || !result} onClick={accept}>
                Accept
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
