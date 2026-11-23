"use client";

import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { COVER_TEMPLATES } from '../../templates/cover-templates';
import type { TemplateDefinition } from '../../types';

interface TemplatesTabProps {
  onApplyTemplate: (template: TemplateDefinition) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Genres' },
  { id: 'business', label: 'Business' },
  { id: 'tech', label: 'Tech & AI' },
  { id: 'fiction', label: 'Fiction' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'mystery', label: 'Thriller' },
  { id: 'minimalist', label: 'Minimalist' },
];

export function TemplatesTab({ onApplyTemplate }: TemplatesTabProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filtered = COVER_TEMPLATES.filter((tmpl: TemplateDefinition) => {
    const matchCategory = selectedCategory === 'all' || tmpl.category === selectedCategory;
    const matchSearch =
      tmpl.title.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.genre.toLowerCase().includes(search.toLowerCase()) ||
      tmpl.description.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Cover Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Professionally designed commercial ebook layouts.
        </p>
      </div>

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
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-primary text-white shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {filtered.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            onClick={() => onApplyTemplate(tmpl)}
            className="group relative flex flex-col text-left rounded-xl border border-border bg-surface overflow-hidden shadow-xs hover:border-primary hover:shadow-md transition-all cursor-pointer"
          >
            {/* Card Thumbnail */}
            <div
              className={`w-full aspect-2/3 bg-linear-to-b ${tmpl.thumbnailGradient} p-3 flex flex-col justify-between relative overflow-hidden`}
            >
              <div className="w-full flex justify-end">
                <span className="text-[9px] font-bold text-white/80 bg-black/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-xs">
                  {tmpl.category}
                </span>
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
    </div>
  );
}
