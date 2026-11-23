import type {
  CoverDesign,
  CoverText,
  DesignLayer,
  TextLayer,
  ShapeLayer,
  IconLayer,
  ImageLayer,
  CanvasSettings,
} from '@ebook/shared';

export type EditorTab = 'templates' | 'elements' | 'text' | 'uploads' | 'backgrounds' | 'ai' | null;

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number; // 0..1 relative to canvas
  label?: string;
}

export interface TransformSession {
  type: 'drag' | 'resize' | 'rotate';
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  startLayers: Record<string, DesignLayer>;
  canvasRect: DOMRect;
  center?: { x: number; y: number };
}

export interface SavedCover {
  version: number;
  data: CoverDesign;
}

export interface CoverVersionMeta {
  id: string;
  version: number;
  createdAt: string;
  artworkId: string | null;
  background: string | null;
}

export interface FontOption {
  value: string;
  label: string;
  category: 'sans' | 'serif' | 'display' | 'script' | 'global';
  fontFamily: string;
}

export const GOOGLE_COVER_FONTS: FontOption[] = [
  // Global Noto Sans scripts
  { value: 'notosans', label: 'Noto Sans (Standard)', category: 'sans', fontFamily: "'notosans', sans-serif" },
  { value: 'notosansbengali', label: 'Noto Sans Bengali', category: 'global', fontFamily: "'notosansbengali', sans-serif" },
  { value: 'notosansarabic', label: 'Noto Sans Arabic', category: 'global', fontFamily: "'notosansarabic', sans-serif" },
  { value: 'notosansdevanagari', label: 'Noto Sans Devanagari', category: 'global', fontFamily: "'notosansdevanagari', sans-serif" },
  
  // Premium Google Typography for Commercial Books
  { value: 'Montserrat', label: 'Montserrat (Modern Bold)', category: 'sans', fontFamily: "'Montserrat', sans-serif" },
  { value: 'Roboto', label: 'Roboto (Clean Tech)', category: 'sans', fontFamily: "'Roboto', sans-serif" },
  { value: 'Poppins', label: 'Poppins (Friendly Geometric)', category: 'sans', fontFamily: "'Poppins', sans-serif" },
  { value: 'Oswald', label: 'Oswald (Condensed Thriller)', category: 'display', fontFamily: "'Oswald', sans-serif" },
  { value: 'Bebas Neue', label: 'Bebas Neue (Impact Headline)', category: 'display', fontFamily: "'Bebas Neue', cursive" },
  { value: 'Cinzel', label: 'Cinzel (Fantasy & Epic)', category: 'serif', fontFamily: "'Cinzel', serif" },
  { value: 'Playfair Display', label: 'Playfair Display (Literary)', category: 'serif', fontFamily: "'Playfair Display', serif" },
  { value: 'Merriweather', label: 'Merriweather (Academic)', category: 'serif', fontFamily: "'Merriweather', serif" },
  { value: 'Dancing Script', label: 'Dancing Script (Artistic Script)', category: 'script', fontFamily: "'Dancing Script', cursive" },
];

export interface ShapePreset {
  id: string;
  name: string;
  shapeType: ShapeLayer['shapeType'];
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  icon?: string;
}

export interface IconPreset {
  name: string;
  iconName: string;
  category: 'publishing' | 'badges' | 'nature' | 'tech' | 'abstract';
}

export interface TemplateDefinition {
  id: string;
  title: string;
  genre: string;
  category:
    | 'business'
    | 'tech'
    | 'fiction'
    | 'fantasy'
    | 'scifi'
    | 'mystery'
    | 'romance'
    | 'wellness'
    | 'children'
    | 'minimalist'
    | 'self_help'
    | 'finance'
    | 'custom';
  description: string;
  background: string;
  shade: number;
  thumbnailGradient: string;
  artworkPlaceholder?: string;
  layers: DesignLayer[];
  isCustom?: boolean;
  createdAt?: string;
}
