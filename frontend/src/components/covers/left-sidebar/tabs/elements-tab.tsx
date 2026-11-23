"use client";

import React from 'react';
import {
  Square,
  Circle,
  Triangle,
  Star,
  Award,
  BookOpen,
  Bookmark,
  Crown,
  Sparkles,
  Flame,
  Shield,
  Heart,
  Feather,
  Compass,
  Trophy,
  Zap,
  Minus,
} from 'lucide-react';
import type { ShapeLayer, IconLayer } from '@ebook/shared';

interface ElementsTabProps {
  onAddShape: (shape: Partial<ShapeLayer>) => void;
  onAddIcon: (iconName: string) => void;
}

const SHAPES = [
  { id: 'rect', label: 'Rectangle', type: 'rectangle' as const, icon: Square },
  { id: 'round', label: 'Rounded Rect', type: 'rounded_rect' as const, icon: Square, radius: 16 },
  { id: 'circle', label: 'Circle', type: 'circle' as const, icon: Circle },
  { id: 'triangle', label: 'Triangle', type: 'triangle' as const, icon: Triangle },
  { id: 'star', label: '5-Point Star', type: 'star' as const, icon: Star },
  { id: 'pill', label: 'Pill Badge', type: 'pill' as const, icon: Square, radius: 9999 },
  { id: 'divider', label: 'Divider Line', type: 'divider' as const, icon: Minus, height: 0.005 },
];

const ICONS = [
  { name: 'book', label: 'Book', component: BookOpen },
  { name: 'bookmark', label: 'Bookmark', component: Bookmark },
  { name: 'award', label: 'Award', component: Award },
  { name: 'crown', label: 'Crown', component: Crown },
  { name: 'star', label: 'Star', component: Star },
  { name: 'sparkles', label: 'Sparkles', component: Sparkles },
  { name: 'flame', label: 'Flame', component: Flame },
  { name: 'shield', label: 'Shield', component: Shield },
  { name: 'heart', label: 'Heart', component: Heart },
  { name: 'feather', label: 'Feather', component: Feather },
  { name: 'trophy', label: 'Trophy', component: Trophy },
  { name: 'zap', label: 'Lightning', component: Zap },
];

export function ElementsTab({ onAddShape, onAddIcon }: ElementsTabProps) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Design Elements</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add shapes, divider lines, and icons to your cover.
        </p>
      </div>

      {/* Shapes Section */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Geometric Shapes
        </span>
        <div className="grid grid-cols-3 gap-2">
          {SHAPES.map((shape) => {
            const Icon = shape.icon;
            return (
              <button
                key={shape.id}
                type="button"
                onClick={() =>
                  onAddShape({
                    shapeType: shape.type,
                    name: shape.label,
                    fill: '#ffffff',
                    borderRadius: shape.radius || 0,
                    width: shape.type === 'divider' ? 0.6 : 0.2,
                    height: shape.height || 0.12,
                  })
                }
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/30 transition-all cursor-pointer group"
              >
                <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-[10px] text-muted-foreground group-hover:text-foreground font-medium mt-1 text-center">
                  {shape.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Publishing Icons Section */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Publishing & Badge Icons
        </span>
        <div className="grid grid-cols-4 gap-2">
          {ICONS.map((icon) => {
            const Icon = icon.component;
            return (
              <button
                key={icon.name}
                type="button"
                onClick={() => onAddIcon(icon.name)}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary-soft/30 transition-all cursor-pointer group"
                title={`Add ${icon.label} icon`}
              >
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-[9px] text-muted-foreground group-hover:text-foreground font-medium mt-1 truncate max-w-full">
                  {icon.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
