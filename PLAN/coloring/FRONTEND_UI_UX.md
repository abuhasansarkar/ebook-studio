# Frontend UI & UX Design Guide: AI Coloring Book Studio

> **Design Goal:** Ensure the coloring book creation process is as effortless, clean, visually engaging, and intuitive as modern design apps like Canva or Linear, eliminating technical friction for authors and publishers.

---

## 1. Visual Language & Design System

To maintain consistency with eBookStudio while offering a fresh, visual-first creative atmosphere, the Coloring Studio uses these design tokens:

### Palette & Tones
- **Backgrounds:** Clean slate neutrals (`bg-background` `#0b0f19` dark / `#ffffff` light, `bg-surface` cards `#111827` dark / `#f8fafc` light).
- **Primary Accent:** Vivid Indigo / Violet (`#6366f1` / `#4f46e5`) symbolizing creative AI generation.
- **Line Art Canvas:** Pure high-contrast `#FFFFFF` container with subtle outer drop-shadow (`shadow-sm` / `border border-border`) so users see exact black-and-white print edges.
- **Status Badges:**
  - `Pending`: Neutral muted gray with dotted border (`bg-muted text-muted-foreground`).
  - `Generating`: Animated gentle pulse in primary indigo (`bg-primary-soft text-primary-hover animate-pulse`).
  - `Ready / Done`: Soft emerald green (`bg-emerald-500/10 text-emerald-500 border-emerald-500/20`).
  - `Needs Review`: Amber caution (`bg-amber-500/10 text-amber-500 border-amber-500/20`).
  - `Failed`: Soft rose/red (`bg-rose-500/10 text-rose-500 border-rose-500/20`).

### Typography & Spacing
- Clean sans-serif hierarchy (`Inter` / system UI sans).
- Large titles with crisp subtitles: *"Create a Coloring Book"* $\rightarrow$ *"Describe your idea and choose a visual style. AI plans the book, generates printable line art, and prepares a KDP-ready PDF."*
- Generous padding (`p-6` to `p-8`) to prevent cognitive overload.

---

## 2. Screen-by-Screen UI & Interaction Design

### 2.1 Studio Dashboard (`/app/coloring-book`)
- **Header:** Title *"AI Coloring Book Studio"*, quick stats (Total Books, Total Pages Generated), and a prominent button: **"+ New Coloring Book"**.
- **Book Cards:**
  - Thumbnail showing the cover or the first 4 coloring pages in a mini 2x2 grid.
  - Title and style badge (e.g., `Kawaii Chibi`, `Mandala`).
  - Progress bar: *"18 of 24 pages generated (75%)"*.
  - Quick action buttons on card: `Open Studio`, `Preview`, `Export PDF`.
- **Empty State:** Friendly graphic with sample ideas (*"Create your first coloring book in under 2 minutes"*) and a 1-click starter template.

---

### 2.2 4-Step Visual Creation Wizard (`/app/coloring-book/create`)

```text
[ Step 1: Idea ] ─── [ Step 2: Art Style ] ─── [ Step 3: Audience ] ─── [ Step 4: Book Format ]
```

#### Step 1: Idea & Title
- **Book Topic:** Auto-expanding text area with friendly placeholder (*"e.g. Cute farm animals having little adventures in flower fields"*).
- **Inspiration Pills:** Quick 1-click ideas (*"Farm Animals"*, *"Enchanted Forest"*, *"Zen Mandalas"*, *"Baby Dinosaurs"*, *"Ocean Mermaids"*).
- **Working Title & Language:** Optional fields pre-filled with sensible defaults.

#### Step 2: Visual Art Style Picker (Visual Cards)
Rather than a plain dropdown, this features a responsive grid of clean selectable cards:
- Each card has an illustrative icon/preview, title, and descriptive microcopy:
  - **Kawaii Chibi**: *"Cute characters, large eyes, rounded simple shapes."*
  - **Mandala & Patterns**: *"Detailed symmetrical geometric and floral patterns."*
  - **Anime**: *"Expressive manga characters, fine dynamic outlines."*
  - **Bold & Easy**: *"Ultra-thick outlines, minimal clutter, perfect for toddlers & seniors."*
  - **Florals & Botanicals**: *"Intricate flowers, leaves, vines, and nature scenes."*
  - **Cute Animals**: *"Adorable pets, farm animals, and baby wildlife."*
  - **Fantasy & Magical**: *"Castles, unicorns, dragons, and mystical landscapes."*
  - **Dinosaurs**: *"Prehistoric adventures, fun Jurassic scenes."*
  - **Ocean & Sea Life**: *"Turtles, coral reefs, tropical fish, and marine wonders."*
  - **Vehicles & Machines**: *"Trucks, airplanes, race cars, and construction equipment."*
  - **Geometric & Abstract**: *"Calming repeating shapes, modern lines."*
  - **Fairytales & Folklore**: *"Storybook heroes, enchanted woods, classic tales."*
- Active selection has a clean indigo ring (`ring-2 ring-primary bg-primary/5`).

#### Step 3: Audience & Complexity
- **Target Audience:** Segmented pill selector: `Preschool (2-4)` | `Kids (5-9)` | `Teens (10-15)` | `Adults (Stress Relief)`.
- **Line Thickness:** Segmented selector: `Thin (Intricate)` | `Medium (Balanced)` | `Thick (Bold Marker)`.
- **Complexity:** `Very Easy` | `Easy` | `Medium` | `Detailed`.

#### Step 4: Book Format & Page Count
- **Interior Pages:** Large button selector: `24 Pages` (Starter) | `30 Pages` | `40 Pages` (Standard) | `50 Pages` | `60 Pages` (Extended).
  - Clear credit indicator badge under each: *"24 pages • 192 credits"*.
- **Trim Size:** `8.5" x 11"` (Standard US Letter - Recommended) | `8.5" x 8.5"` (Square) | `8.25" x 11"` | `A4`.
- **Single-Sided Printing Toggle:** Switched ON by default with helper text: *"Inserts a blank page behind each illustration to prevent marker bleed-through on physical paper."*
- **Call-to-Action:** **"Generate Book Plan (Free)"** with microcopy: *"Planning is 100% free. No credits are spent until you generate illustrations."*

---

### 2.3 Studio Sub-Navigation Bar (`/app/coloring-book/:bookId/...`)

A persistent, sticky top bar across all coloring book screens:
- **Left:** Back to coloring books link, Book Title, Status Badge (`Draft`, `Planning`, `In Progress`, `Ready`).
- **Center:** Clean stage navigation tabs:
  - `Plan` (Concept & scenes)
  - `Pages` (Visual grid & generation)
  - `Editor` (Prompt tuning & zoom)
  - `Quality` (Preflight inspection)
  - `Cover` (Cover designer & spine)
  - `Preview` (Physical spread reader)
  - `Export` (Print-ready PDF & KDP package)
- **Right:** Total generated counter (`18/24`), Credit wallet balance, and Primary Action button contextually adapting to the current stage.

---

### 2.4 Page Grid & Single-Page Regeneration (`.../:bookId/pages`)

This is the central workspace where authors interact with their book:
- **Top Bar:** Filter by status (`All`, `Completed`, `Pending`, `Needs Review`), Search scenes, and **"Generate All Pending Pages (N credits)"** button.
- **Responsive Masonry Grid:**
  - Each page card:
    - **Header:** Page number badge (`Page 08`), Scene Title (`"Baby Pig Playing in Mud"`).
    - **Image Canvas:**
      - If completed: Crisp 300 DPI thumbnail on pure white paper container.
      - If generating: Smooth skeleton shimmer with percentage progress.
      - If pending: Clean empty state with prompt summary.
    - **Hover Overlay Actions:**
      - **"Regenerate"** button with lightning icon.
      - **"Edit Prompt"** icon.
      - **"Full Screen Zoom"** icon.
      - **"Quality Report"** status pill (`98% Pass`).

#### The Single-Page Regeneration Modal (Crucial UX Feature)
When an author clicks **"Regenerate"** on Page 8:
- A clean, focused dialog opens over the card:
  - Shows current prompt: *"A cute baby pig playing happily in a mud puddle beside a wooden fence."*
  - Shows an optional tweak box: *"What would you like to change?"* (e.g. *"Make the pig wear little boots and remove the fence"*).
  - Shows clear credit confirmation: *"Regenerates Page 8 only • Cost: 8 credits • Remaining balance: 340 credits"*.
  - Buttons: `Cancel` and `Regenerate This Page (8 credits)`.
- On submit: The modal closes, page 8 switches to generating pulse, and updates in-place when done. **Zero other pages are affected!**

---

### 2.5 Deep Page Editor (`.../:bookId/editor`)
- **Split Layout:**
  - **Left (60%):** Interactive High-Resolution Canvas:
    - Mouse wheel zoom (100% to 400%) and pan to inspect line details.
    - Overlay toggle: Print Bleed Line (red), Margin Safe Zone (green), Gutter Margin (blue).
  - **Right (40%):** Controls & Metadata:
    - Scene title & description.
    - Compiled line-art prompt (editable).
    - Negative prompt exclusions (e.g., *"no shading, no gray, no text, no colored background"*).
    - Optional page caption text (e.g., *"P is for Pig"*).
    - **"Upload Custom Replacement"** drop-zone (PNG, SVG, WebP).
    - **"Regenerate Illustration"** primary button.

---

### 2.6 Quality Inspector (`.../:bookId/quality`)
- **Overall Book Readiness Gauge:** Circular gauge (e.g. `98% KDP Ready`).
- **Interactive Check Cards:**
  - **Background Purity:** `100% Pure White (#FFFFFF)` — No gray wash or textured paper artifacts.
  - **Color Contamination:** `0% Saturation` — Pure monochrome black and white line art.
  - **Line Contrast:** `Sharp Outlines` — Crisp edges for coloring.
  - **Resolution Preflight:** `300 DPI Verified` — Full high-res print output at 8.5" × 11".
- **Issues Filter:** Click *"1 Page with Warning"* $\rightarrow$ highlights Page 14 with a 1-click **"Auto-Clean Lines"** button that instantly enhances the raster contrast.

---

### 2.7 Cover Studio & Spine Calculator (`.../:bookId/cover`)
- **Full Wrap Cover Preview:** Displays Front Cover, Spine, and Back Cover side-by-side in exact physical proportion.
- **Front Cover Designer:**
  - Generates colorful, commercial front cover artwork matching the book theme.
  - Typography controls: Title, Subtitle, Author with font family, weight, size, and position sliders.
- **Dynamic Spine Calculator:**
  - Displays: *"Interior: 48 pages • Spine Thickness: 0.108 inches (2.74 mm)"*.
  - Informs author if page count meets Amazon KDP spine text threshold ($\ge 79$ pages).
- **Back Cover Designer:**
  - Book blurb text editor.
  - **Sample Gallery:** Automatically displays 3–4 preview thumbnails of interior coloring pages.
  - Barcode Safe Zone indicator ($2.0" \times 1.2"$) in bottom-right corner.

---

### 2.8 Physical Book Previewer (`.../:bookId/preview`)
- Dual-page spread reader that flips smoothly between pages:
  - Left page: Clean blank back page (reflecting physical reality).
  - Right page: The coloring page illustration.
- Allows authors to flip through page 1 to 48 just like a physical paperback book.

---

### 2.9 Export & KDP Publishing Pack (`.../:bookId/export`)
- **Preflight Compliance Checklist:** 4 green checkmarks indicating full KDP readiness.
- **Download Section:**
  - **[Download Print-Ready Interior PDF]** (300 DPI, single-sided blank backs, embedded).
  - **[Download Wrap-Around Cover PDF]** (exact trim + bleed + calculated spine).
  - **[Download Complete KDP Publishing Bundle (.ZIP)]**.
- **Amazon Listing Assistant:**
  - Amazon Title & Subtitle.
  - 7 KDP Search Keywords (with one-click "Copy All").
  - Category suggestions.
  - Formatted Amazon HTML Book Description with bullet points (ready to paste into KDP).
