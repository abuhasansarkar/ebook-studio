"use client";

import React, { useState } from 'react';
import { Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { operationRequest } from '@/lib/operation-request';
import type { SavedCover } from '../../types';

interface AiDesignerTabProps {
  bookId: string;
  onApplyCover: (cover: SavedCover) => void;
  onSetArtwork: (assetId: string) => void;
}

const STYLE_OPTIONS = [
  { value: 'modern', label: 'Modern & Sleek' },
  { value: 'minimalist', label: 'Minimalist & Clean' },
  { value: 'business', label: 'Professional Business' },
  { value: 'tech', label: 'Technology & AI' },
  { value: 'fiction', label: 'Fiction & Drama' },
  { value: 'fantasy', label: 'Epic Fantasy & Magic' },
  { value: 'scifi', label: 'Science Fiction & Space' },
  { value: 'mystery', label: 'Mystery & Thriller' },
  { value: 'romance', label: 'Romance & Drama' },
  { value: 'children', label: "Children's Illustrated" },
  { value: 'wellness', label: 'Health & Wellness' },
];

export function AiDesignerTab({
  bookId,
  onApplyCover,
  onSetArtwork,
}: AiDesignerTabProps) {
  const [style, setStyle] = useState('modern');
  const [userPrompt, setUserPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [variations, setVariations] = useState<{ id: string; styleName: string; plan: any }[] | null>(null);

  const handleGenerate = async (selectedStyle = style) => {
    setBusy(true);
    try {
      const res = await operationRequest<{ cover: SavedCover }>(`/books/${bookId}/cover/ai-generate`, {
        style: selectedStyle,
        userPrompt: userPrompt.trim() || undefined,
      });
      toast.success('AI cover generated and applied successfully!');
      onApplyCover(res.cover);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExploreVariations = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ variations: { id: string; styleName: string; plan: any }[] }>(`/books/${bookId}/cover/ai-variations`, {
        style,
        userPrompt: userPrompt.trim() || undefined,
      });
      setVariations(res.variations);
      toast.success('Generated 3 style concepts.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>AI Cover Studio</span>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generates bespoke artwork using OpenAI. Typography remains completely editable.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Visual Style</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={busy}
            className="w-full h-8 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-primary"
          >
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Custom Instructions (Optional)</label>
          <textarea
            placeholder="e.g. Atmospheric lighting, dramatic contrast, futuristic tech elements"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            maxLength={1000}
            disabled={busy}
            className="w-full min-h-16 p-2 rounded-lg border border-border bg-surface text-xs placeholder:text-muted-foreground/60 resize-none focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="w-full justify-center gap-1.5 text-xs font-semibold shadow-xs"
          >
            {busy && !variations ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>Generate & Apply Cover</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExploreVariations}
            disabled={busy}
            className="w-full justify-center gap-1.5 text-xs"
          >
            {busy && variations ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Preview 3 Style Concepts</span>
          </Button>
        </div>
      </div>

      {/* Style Concept Variations */}
      {variations && (
        <div className="space-y-2 pt-2 border-t border-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Style Concepts
          </span>
          <div className="space-y-2">
            {variations.map((v) => (
              <div
                key={v.id}
                className="p-3 rounded-xl border border-border bg-surface flex flex-col justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <span className="font-bold capitalize text-primary text-[11px]">{v.styleName}</span>
                  <p className="line-clamp-2 text-[10px] text-muted-foreground leading-relaxed">
                    {v.plan.visualConcept}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => { setStyle(v.styleName); void handleGenerate(v.styleName); }}
                  className="w-full text-xs h-7"
                >
                  Apply This Style
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
