"use client";

import React from 'react';
import { Type, Heading1, Heading2, AlignLeft, Sparkles } from 'lucide-react';
import type { TextLayer } from '@ebook/shared';

interface TextTabProps {
  onAddText: (textLayer: Partial<TextLayer>) => void;
}

const FONT_PAIRINGS = [
  {
    title: 'Modern Authority',
    headlineFont: 'Montserrat',
    headlineWeight: '900',
    subtitleFont: 'Roboto',
    sample: 'LEADERSHIP IN THE DIGITAL AGE',
  },
  {
    title: 'Literary & Classic',
    headlineFont: 'Playfair Display',
    headlineWeight: '700',
    subtitleFont: 'Merriweather',
    sample: 'The Whisper of Old Trees',
  },
  {
    title: 'Fantasy & Epic',
    headlineFont: 'Cinzel',
    headlineWeight: '700',
    subtitleFont: 'Cinzel',
    sample: 'REALM OF STARLIGHT',
  },
  {
    title: 'High-Impact Action',
    headlineFont: 'Bebas Neue',
    headlineWeight: '700',
    subtitleFont: 'Montserrat',
    sample: 'ZERO TOLERANCE',
  },
];

export function TextTab({ onAddText }: TextTabProps) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Add Text</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Insert stylized typography layers onto your cover.
        </p>
      </div>

      {/* Quick Add Buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() =>
            onAddText({
              text: 'Add a heading',
              font: 'Montserrat',
              size: 0.08,
              weight: '900',
              role: 'title',
              name: 'Heading Text',
            })
          }
          className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/30 transition-all cursor-pointer group text-left"
        >
          <div className="space-y-0.5">
            <span className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors block">
              Add a heading
            </span>
            <span className="text-[11px] text-muted-foreground">Bold prominent title</span>
          </div>
          <Heading1 className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        <button
          type="button"
          onClick={() =>
            onAddText({
              text: 'Add a subheading',
              font: 'Montserrat',
              size: 0.035,
              weight: '600',
              role: 'subtitle',
              name: 'Subheading Text',
            })
          }
          className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/30 transition-all cursor-pointer group text-left"
        >
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors block">
              Add a subheading
            </span>
            <span className="text-[11px] text-muted-foreground">Medium descriptive text</span>
          </div>
          <Heading2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        <button
          type="button"
          onClick={() =>
            onAddText({
              text: 'Add a little bit of body text or author name',
              font: 'Roboto',
              size: 0.022,
              weight: '400',
              role: 'custom',
              name: 'Body / Tagline Text',
            })
          }
          className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/30 transition-all cursor-pointer group text-left"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors block">
              Add body text
            </span>
            <span className="text-[10px] text-muted-foreground">Small tagline, quote, or author</span>
          </div>
          <AlignLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </div>

      {/* Font Combinations Section */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Curated Font Pairings
        </span>
        <div className="space-y-2">
          {FONT_PAIRINGS.map((pairing, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                onAddText({
                  text: pairing.sample,
                  font: pairing.headlineFont,
                  weight: pairing.headlineWeight as any,
                  size: 0.065,
                  name: `${pairing.title} Text`,
                })
              }
              className="w-full p-3 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/20 text-left transition-all cursor-pointer group space-y-1"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {pairing.title}
              </span>
              <p
                className="text-xs font-bold text-foreground group-hover:text-primary truncate"
                style={{ fontFamily: `'${pairing.headlineFont}', sans-serif` }}
              >
                {pairing.sample}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {pairing.headlineFont} + {pairing.subtitleFont}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
