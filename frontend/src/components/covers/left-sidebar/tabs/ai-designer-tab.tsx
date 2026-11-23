"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Wand2,
  Coins,
  CheckCircle,
  PlusCircle,
  Palette,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { operationRequest } from '@/lib/operation-request';
import { imageUrl } from '@/components/assets/asset-library';
import { qk } from '@/lib/queries';
import type { SavedCover } from '../../types';

interface ImageJob {
  id: string;
  status: string;
  cancelRequested: boolean;
  assetId: string | null;
  creditsReserved: number;
  creditsCharged: number;
  error: string | null;
  input: {
    request: { purpose: string; prompt: string };
  };
}

interface AiDesignerTabProps {
  bookId: string;
  onApplyCover: (cover: SavedCover) => void;
  onSetArtwork: (assetId: string) => void;
  onAddImageLayer?: (url: string, name?: string) => void;
}

const STYLE_OPTIONS = [
  { value: 'modern', label: 'Modern & Sleek' },
  { value: 'minimalist', label: 'Minimalist & Clean' },
  { value: 'business', label: 'Professional Business' },
  { value: 'tech', label: 'Technology & AI' },
  { value: 'finance', label: 'Finance & Wealth' },
  { value: 'fiction', label: 'Fiction & Drama' },
  { value: 'fantasy', label: 'Epic Fantasy & Magic' },
  { value: 'scifi', label: 'Science Fiction & Cyberpunk' },
  { value: 'mystery', label: 'Mystery & Thriller' },
  { value: 'romance', label: 'Romance & Drama' },
  { value: 'children', label: "Children's Illustrated" },
  { value: 'wellness', label: 'Health & Wellness' },
];

const PROMPT_PRESETS = [
  {
    label: 'Dramatic Sunset Sea',
    prompt: 'Cinematic sunset ocean horizon with soft warm golden hour light reflecting on calm water, gentle waves, minimalist moody atmosphere',
  },
  {
    label: 'Cyberpunk Neon City',
    prompt: 'Futuristic cyberpunk neon city skyline at dusk viewed from a high rooftop, glowing holographic cyan and magenta accents, deep dark blue shadows',
  },
  {
    label: 'Fantasy Enchanted Forest',
    prompt: 'Mystical ancient forest with towering mossy trees, glowing golden motes of magical light, misty atmospheric depth, ethereal fantasy mood',
  },
  {
    label: 'Minimalist Architecture',
    prompt: 'Clean modern brutalist architectural structure with geometric concrete angles, harsh dramatic sunlight and soft natural shadows, minimalist aesthetic',
  },
];

export function AiDesignerTab({
  bookId,
  onApplyCover,
  onSetArtwork,
  onAddImageLayer,
}: AiDesignerTabProps) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'cover' | 'artwork'>('cover');

  // Full Cover Generator State
  const [style, setStyle] = useState('modern');
  const [userPrompt, setUserPrompt] = useState('');
  const [busyCover, setBusyCover] = useState(false);
  const [variations, setVariations] = useState<{ id: string; styleName: string; plan: any }[] | null>(null);

  // Artwork Scene Generator State
  const [artworkPrompt, setArtworkPrompt] = useState('');
  const [busyArtwork, setBusyArtwork] = useState(false);

  // Image Config & Pricing
  const config = useQuery({
    queryKey: ['image-config'],
    queryFn: () =>
      api.get<{ credits: number; model: string; mock: boolean; enabled: boolean }>('/image-config'),
  });

  // Image History
  const history = useQuery({
    queryKey: ['image-jobs', bookId],
    queryFn: () => api.get<{ jobs: ImageJob[]; nextCursor: string | null }>(`/books/${bookId}/images`),
    refetchInterval: (q) =>
      q.state.data?.jobs.some((j) => ['queued', 'running'].includes(j.status)) ? 1500 : false,
  });

  // Invalidate credits when jobs settle
  const settled =
    history.data?.jobs
      .filter((j) => !['queued', 'running'].includes(j.status))
      .map((j) => `${j.id}:${j.status}`)
      .join(',') ?? '';

  useEffect(() => {
    if (!settled) return;
    void qc.invalidateQueries({ queryKey: qk.credits });
    void qc.invalidateQueries({ queryKey: ['assets'] });
  }, [settled, qc]);

  const handleGenerateCover = async (selectedStyle = style) => {
    setBusyCover(true);
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
      setBusyCover(false);
    }
  };

  const handleExploreVariations = async () => {
    setBusyCover(true);
    try {
      const res = await api.post<{ variations: { id: string; styleName: string; plan: any }[] }>(
        `/books/${bookId}/cover/ai-variations`,
        {
          style,
          userPrompt: userPrompt.trim() || undefined,
        }
      );
      setVariations(res.variations);
      toast.success('Generated 3 style concepts.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyCover(false);
    }
  };

  const handleGenerateArtwork = async () => {
    if (artworkPrompt.trim().length < 10) {
      toast.error('Please enter at least 10 characters for the artwork prompt.');
      return;
    }
    setBusyArtwork(true);
    try {
      await operationRequest(`/books/${bookId}/images`, {
        purpose: 'cover',
        prompt: artworkPrompt.trim(),
        aspect: 'portrait',
        expectedCredits: config.data?.credits ?? 5,
      });
      toast.success('Artwork generation queued!');
      await qc.invalidateQueries({ queryKey: ['image-jobs', bookId] });
      setArtworkPrompt('');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyArtwork(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Mode Switcher */}
      <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setMode('cover')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mode === 'cover'
              ? 'bg-surface text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Full Cover</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('artwork')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mode === 'artwork'
              ? 'bg-surface text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          <span>Artwork Only</span>
        </button>
      </div>

      {mode === 'cover' ? (
        /* Full Cover Generation Mode */
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <span>Intelligent Cover Generation</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generates topic-tailored artwork while preserving your editable typography layers.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Visual Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                disabled={busyCover}
                className="w-full h-8 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
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
                disabled={busyCover}
                className="w-full min-h-16 p-2 rounded-lg border border-border bg-surface text-xs placeholder:text-muted-foreground/60 resize-none focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => void handleGenerateCover()}
                disabled={busyCover}
                className="w-full justify-center gap-1.5 text-xs font-semibold shadow-xs"
              >
                {busyCover && !variations ? (
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
                disabled={busyCover}
                className="w-full justify-center gap-1.5 text-xs"
              >
                {busyCover && variations ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
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
                      <span className="font-bold capitalize text-primary text-[11px]">
                        {v.styleName}
                      </span>
                      <p className="line-clamp-2 text-[10px] text-muted-foreground leading-relaxed">
                        {v.plan.visualConcept}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyCover}
                      onClick={() => {
                        setStyle(v.styleName);
                        void handleGenerateCover(v.styleName);
                      }}
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
      ) : (
        /* Artwork Scene Generator Mode */
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center justify-between">
              <span>Artwork Scene Generator</span>
              {config.data && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Coins className="h-3 w-3" />
                  {config.data.credits} credits
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generates standalone background art without replacing your current typography layers.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Artwork Scene Prompt</label>
              <textarea
                placeholder="Describe scene, subject, lighting, and mood (e.g. cinematic misty mountain lake at sunrise)..."
                value={artworkPrompt}
                onChange={(e) => setArtworkPrompt(e.target.value)}
                maxLength={2000}
                disabled={busyArtwork}
                className="w-full min-h-20 p-2 rounded-lg border border-border bg-surface text-xs placeholder:text-muted-foreground/60 resize-none focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Quick Inspiration Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Lightbulb className="h-3 w-3 text-amber-500" />
                <span>Prompt Presets</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setArtworkPrompt(preset.prompt)}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-border bg-surface hover:border-primary/60 hover:text-primary transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => void handleGenerateArtwork()}
              disabled={busyArtwork || artworkPrompt.trim().length < 10}
              className="w-full justify-center gap-1.5 text-xs font-semibold shadow-xs"
            >
              {busyArtwork ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              <span>Generate Artwork Scene</span>
            </Button>
          </div>

          {/* Generated Artwork Gallery */}
          <div className="space-y-2 pt-2 border-t border-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Generated Artwork History
            </span>

            {history.isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading artwork history…</p>
            ) : !history.data?.jobs || history.data.jobs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No generated artworks yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {history.data.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-2.5 rounded-xl border border-border bg-surface flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold capitalize text-foreground">
                        {job.status === 'completed' ? (
                          <span className="text-emerald-500 flex items-center gap-1 font-bold">
                            <CheckCircle className="h-3 w-3" /> Ready
                          </span>
                        ) : job.status === 'running' || job.status === 'queued' ? (
                          <span className="text-amber-500 flex items-center gap-1 font-bold">
                            <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                          </span>
                        ) : (
                          <span className="text-danger">{job.status}</span>
                        )}
                      </span>
                    </div>

                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {job.input.request.prompt}
                    </p>

                    {job.status === 'completed' && job.assetId && (
                      <div className="space-y-2 pt-1">
                        <div className="w-full aspect-2/3 rounded-lg overflow-hidden border border-border bg-black/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl(job.assetId)}
                            alt="Generated concept"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onSetArtwork(job.assetId!);
                              toast.success('Applied to cover background!');
                            }}
                            className="flex-1 text-[10px] h-6 px-1.5"
                          >
                            Set Background
                          </Button>
                          {onAddImageLayer && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                onAddImageLayer(imageUrl(job.assetId!), 'AI Artwork Layer');
                                toast.success('Added as image layer!');
                              }}
                              className="text-[10px] h-6 px-1.5"
                              title="Add as movable image layer"
                            >
                              <PlusCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
