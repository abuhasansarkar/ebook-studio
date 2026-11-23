"use client";

import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Plus, Trash2, BookmarkCheck, Check } from 'lucide-react';
import { toast } from 'sonner';
import { COVER_TEMPLATES } from '../../templates/cover-templates';
import type { TemplateDefinition } from '../../types';
import type { CoverDesign } from '@ebook/shared';
import { Button } from '@/components/ui/button';

interface TemplatesTabProps {
  currentDesign?: CoverDesign;
  onApplyTemplate: (template: TemplateDefinition) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Genres' },
  { id: 'custom', label: 'My Templates' },
  { id: 'business', label: 'Business' },
  { id: 'self_help', label: 'Self-Help' },
  { id: 'tech', label: 'Tech & AI' },
  { id: 'finance', label: 'Finance' },
  { id: 'fiction', label: 'Fiction' },
  { id: 'romance', label: 'Romance' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'mystery', label: 'Thriller' },
  { id: 'children', label: "Children's" },
  { id: 'wellness', label: 'Wellness' },
  { id: 'minimalist', label: 'Minimalist' },
];

const LOCAL_STORAGE_KEY = 'ebook_custom_cover_templates_v1';

export function TemplatesTab({ currentDesign, onApplyTemplate }: TemplatesTabProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customTemplates, setCustomTemplates] = useState<TemplateDefinition[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateGenre, setNewTemplateGenre] = useState('Custom Style');

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TemplateDefinition[];
        if (Array.isArray(parsed)) {
          setCustomTemplates(parsed);
        }
      }
    } catch {
      // ignore parsing errors
    }
  }, []);

  const saveCustomTemplate = () => {
    if (!currentDesign) {
      toast.error('No current design available to save.');
      return;
    }
    const title = newTemplateTitle.trim() || 'My Custom Template';
    const newTemplate: TemplateDefinition = {
      id: `custom-tmpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      genre: newTemplateGenre.trim() || 'Custom',
      category: 'custom',
      description: `Saved user custom template with ${currentDesign.layers?.length || 0} layers.`,
      background: currentDesign.background,
      shade: currentDesign.shade,
      thumbnailGradient: 'from-violet-600 via-purple-700 to-indigo-950',
      layers: currentDesign.layers ? JSON.parse(JSON.stringify(currentDesign.layers)) : [],
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...customTemplates];
    setCustomTemplates(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      toast.success(`Saved "${title}" to My Templates!`);
    } catch {
      toast.error('Could not save to local storage.');
    }

    setNewTemplateTitle('');
    setShowSaveModal(false);
    setSelectedCategory('custom');
  };

  const deleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      toast.info('Template removed.');
    } catch {
      // ignore
    }
  };

  const allTemplates = [...customTemplates, ...COVER_TEMPLATES];

  const filtered = allTemplates.filter((tmpl: TemplateDefinition) => {
    const matchCategory =
      selectedCategory === 'all'
        ? true
        : selectedCategory === 'custom'
        ? tmpl.isCustom || tmpl.category === 'custom'
        : tmpl.category === selectedCategory;

    const matchSearch =
      tmpl.title.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.genre.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.description.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-foreground">Cover Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Professionally designed commercial ebook layouts.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowSaveModal(!showSaveModal)}
          className="text-xs h-7 gap-1 px-2 shrink-0"
          title="Save current cover as a reusable custom template"
        >
          <Plus className="h-3.5 w-3.5 text-primary" />
          <span>Save As</span>
        </Button>
      </div>

      {/* Save Template Prompt */}
      {showSaveModal && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-xs font-bold text-foreground">Save Current Design as Template</span>
          <input
            type="text"
            placeholder="Template name (e.g. Minimalist Gold)"
            value={newTemplateTitle}
            onChange={(e) => setNewTemplateTitle(e.target.value)}
            className="w-full h-7 px-2 rounded border border-border bg-surface text-xs focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSaveModal(false)}
              className="h-6 text-[11px] px-2"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveCustomTemplate}
              className="h-6 text-[11px] px-2.5"
            >
              Save Template
            </Button>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by genre, style..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-surface text-xs placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const count =
            cat.id === 'custom'
              ? customTemplates.length
              : cat.id === 'all'
              ? allTemplates.length
              : allTemplates.filter((t) => t.category === cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{cat.label}</span>
              {count > 0 && (
                <span
                  className={`text-[9px] px-1 py-0.2 rounded-full ${
                    selectedCategory === cat.id ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center space-y-2 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs text-muted-foreground">
            {selectedCategory === 'custom'
              ? 'No custom templates yet. Click "Save As" above to save your current cover design!'
              : 'No templates match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-1">
          {filtered.map((tmpl: TemplateDefinition) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onApplyTemplate(tmpl)}
              className="group relative flex flex-col text-left rounded-xl border border-border bg-surface overflow-hidden shadow-xs hover:border-primary hover:shadow-md transition-all cursor-pointer"
            >
              {/* Card Thumbnail */}
              <div
                className={`w-full aspect-2/3 bg-linear-to-b ${tmpl.thumbnailGradient} p-2.5 flex flex-col justify-between relative overflow-hidden`}
              >
                <div className="w-full flex items-center justify-between">
                  {tmpl.isCustom ? (
                    <span className="text-[9px] font-bold text-amber-200 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-xs flex items-center gap-0.5">
                      <BookmarkCheck className="h-2.5 w-2.5" />
                      <span>Custom</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-white/80 bg-black/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-xs">
                      {tmpl.category}
                    </span>
                  )}

                  {tmpl.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => deleteCustomTemplate(tmpl.id, e)}
                      className="p-1 rounded bg-black/40 hover:bg-rose-600/80 text-white/80 hover:text-white transition-colors"
                      title="Delete custom template"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-white font-extrabold text-[11px] leading-tight drop-shadow-xs line-clamp-2">
                    {tmpl.title}
                  </p>
                  <p className="text-white/70 text-[9px] font-medium leading-none line-clamp-1">
                    {tmpl.genre}
                  </p>
                </div>
              </div>

              <div className="p-2 bg-surface">
                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {tmpl.title}
                </p>
                <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {tmpl.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
