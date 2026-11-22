# Phased Implementation Plan: AI Coloring Book Studio

Each phase builds directly upon the previous phase, following the established eBookStudio engineering standards. **No code should be implemented until all phase contracts and clean UI designs are approved.**

---

## Phase 1 — Foundation, Shared Contracts & Free AI Planner

### Objective
Establish the core data contracts, database schema, creation wizard, and free AI concept/page planning pipeline.

### Deliverables
1. **Shared Contracts (`packages/shared/src/coloring.ts`)**:
   - `COLORING_STYLES` dictionary with human labels, descriptions, and prompt visual directions:
     - Kawaii Chibi, Mandala & Patterns, Anime, Bold & Easy, Florals & Botanicals, Cute Animals, Fantasy & Magical, Dinosaurs, Ocean & Sea Life, Vehicles & Machines, Geometric & Abstract, Fairytales.
   - `COLORING_AUDIENCES`: `preschool`, `children`, `teens`, `adults`.
   - `COLORING_DIFFICULTIES`: `very_easy`, `easy`, `medium`, `detailed`.
   - `COLORING_LINE_THICKNESS`: `thin`, `medium`, `thick`.
   - `COLORING_TRIM_SIZES`: `8.5x11`, `8.5x8.5`, `8.25x11`, `A4`.
   - `coloringBookBriefSchema`: Validates creation wizard inputs.
   - `coloringPlanSchema`: Validates AI planner output (Title, subtitle, collection of 24–60 page scene concepts).
   - `COLORING_CREDIT_COSTS`: Plan is 0 credits; per-page illustration is 8 credits.
2. **Database Schema (`backend/prisma/schema.prisma`)**:
   - Link `ColoringPlan` and `ColoringPage` to `Book` where `bookType = "coloring_book"`.
   - Store settings: artStyle, targetAudience, difficulty, lineThickness, trimSize, bleed, singleSided, pageCount, density.
   - Store individual pages: pageNumber, title, description, prompt, status (`pending`, `generating`, `completed`, `failed`), assetId, qualityChecks.
3. **Backend Planner Service (`coloringPlanService.ts`)**:
   - Generates 24–60 unique, cohesive scene prompts using OpenAI structured JSON (or deterministic mock if `AI_MOCK=1`).
   - Completely free: 0 credits charged.
   - Saves book and pages in `pending` state.
4. **Clean UI Frontend (`/app/coloring-book/create` & `.../:bookId/plan`)**:
   - **4-Step Clean Wizard**:
     - Step 1: Idea prompt & title.
     - Step 2: Visual Style Picker (clean cards with artwork style tags and descriptions).
     - Step 3: Audience & Complexity (Preschool to Adults, Line thickness).
     - Step 4: Book Format (Page count selector: 24, 30, 40, 50, 60; Trim size; Single-sided toggle).
   - **Plan Review Screen**:
     - Lists all planned scene titles and descriptions.
     - Editable in-place with instant auto-save.
     - Prominent callout: *"Planning is 100% Free • Approve Plan to Continue"*.

### Gate 1
- A user can create a coloring book concept, choose any of the 12 styles, generate 24–60 page concepts for free, edit any scene description, and approve the plan with 0 credits charged.

---

## Phase 2 — Line-Art Generation Engine & Independent Page Control

### Objective
Implement the OpenAI line-art generation queue, atomic credit reservations, and independent single-page generation and regeneration.

### Deliverables
1. **Prompt Compiler (`coloringPromptBuilder.ts`)**:
   - Strict coloring page system rules:
     - Pure black-and-white line art only.
     - Solid pure white background (`#FFFFFF`).
     - Crisp, clean vector-like outlines with closed shapes.
     - Zero color, zero grayscale shading, zero halftones, zero textures.
     - Zero typography, zero watermarks, zero borders or edge-clipping.
   - Injects style modifiers (e.g. Kawaii: chubby rounded figures; Mandala: radial symmetry; Bold & Easy: ultra-thick clean outlines).
2. **Queue Workers & Credit Handling**:
   - BullMQ queue `coloring_pages`.
   - **Single Page Generation**:
     - Atomically reserves 8 credits using `reserveInTransaction`.
     - Generates illustration via OpenAI Images API (or mock).
     - Sanitizes raster buffer with Sharp, uploads to private storage, creates `Asset`.
     - Updates `ColoringPage` to `completed` and settles 8 credits.
     - If failed, releases reserved credits back to the user's wallet.
   - **Batch Generation**:
     - Allows generating all pending pages in one click with clear total credit cost upfront.
     - Processes each page with progress updates (`Progress: 6/24 pages completed`).
3. **Clean UI Frontend (`/app/coloring-book/:bookId/pages`)**:
   - Visual masonry grid of all pages:
     - High-res line-art preview.
     - Page number badge and scene title.
     - Status indicators: `Pending` (dashed outline), `Generating` (animated pulse), `Done` (clean preview), `Failed` (retry button).
   - **Single-Page Quick Action**:
     - Click **"Regenerate"** on any page card.
     - Opens a sleek modal with the current prompt and an optional prompt tweak input (e.g. *"Make the cow smiling bigger"*).
     - Confirms: *"Regenerates Page 8 only • 8 credits"*.
     - Updates page 8 in-place without touching any other pages!

### Gate 2
- A user with 24 planned pages can generate the entire book in a queue. If page 8 has an issue, the user can regenerate only page 8, spending only 8 credits, leaving all other 23 pages unchanged.

---

## Phase 3 — Visual Page Editor & Arranger

### Objective
Provide full creative control to inspect, refine prompts, reorder pages, add new pages, and upload custom illustrations.

### Deliverables
1. **Drag-and-Drop Page Reordering**:
   - Integrate `@dnd-kit/sortable` for intuitive drag-and-drop page rearrangement.
   - Backend endpoint `POST /coloring/books/:bookId/pages/reorder` reassigns `pageNumber` sequence atomically in one transaction.
2. **Deep Page Editor (`/app/coloring-book/:bookId/editor`)**:
   - Split-pane clean layout:
     - Left pane: Full-resolution image zoom & pan viewer with grid and margin overlays.
     - Right pane: Scene prompt controls, negative prompt overrides, optional page caption/typography, and regeneration trigger.
3. **Custom Illustration Upload**:
   - Allows users to upload their own PNG/WebP/SVG line-art file for any page (e.g. drawn in Procreate or Illustrator).
   - Runs sanitization with Sharp and assigns as the page's asset.
4. **Page Management**:
   - "Add New Page" button at the end of the book.
   - "Delete Page" with confirmation dialog, re-indexing remaining pages automatically.

### Gate 3
- A user can reorder pages by dragging, customize prompts in the deep editor, upload a custom line-art replacement, and add/remove pages effortlessly.

---

## Phase 4 — Automated Quality Inspector

### Objective
Ensure every generated coloring page meets strict commercial print and line-art quality standards before printing.

### Deliverables
1. **Sharp Quality Analysis Algorithm (`coloringQualityService.ts`)**:
   - **Pure White Background Check**: Analyzes edge margins and non-stroke pixels to ensure background is $\ge 98\%$ pure white (`#FFFFFF`) with no dark vignette or canvas texture.
   - **Color Contamination Check**: Scans pixel channels to verify $R = G = B$ (0% chromatic saturation).
   - **Grayscale / Shading Check**: Verifies sharp binary thresholding between black lines and white fills, flagging muddy grayscale gradients or halftones.
   - **300 DPI Print Resolution Check**: Checks pixel dimensions against selected trim size (e.g., $2550 \times 3300\text{ px}$ for 8.5" × 11" at 300 DPI).
2. **Clean Quality Dashboard (`/app/coloring-book/:bookId/quality`)**:
   - **Overall Book Health Gauge**: 0–100% Print Readiness score.
   - **Summary Badges**: `All Clean`, `Minor Shading Found`, or `Resolution Alert`.
   - **Page-by-Page Audit Table/Grid**:
     - Visual pill: `Pure White BG: PASS`, `Zero Color: PASS`, `300 DPI: PASS`.
     - If flagged: Clear explanation in plain English (e.g. *"Page 12 has slight gray background shading"*).
     - **1-Click Action**: *"Auto-Clean Line Art"* (sharpens contrast to pure binary line art) or *"Regenerate Page"* with reinforced prompt.

### Gate 4
- The system automatically inspects all pages for background purity, color contamination, and 300 DPI resolution, surfacing actionable warnings and 1-click fixes.

---

## Phase 5 — Cover Studio & Spine Calculator

### Objective
Design commercial-grade full-color paperback covers with dynamic spine calculation and back-cover thumbnail galleries.

### Deliverables
1. **Front Cover Artwork Generator**:
   - Generates vibrant full-color artwork matching the coloring book's theme and style (e.g. colorful cute farm animals).
   - Clean typographic overlays: Title, Subtitle, Author with font family, size, color, and position adjustments.
2. **Exact KDP Spine Thickness Math**:
   - Automatic calculation based on interior page count and paper type:
     $$\text{Spine Width} = \text{Total Pages} \times 0.002252\text{ inches (White paper)}$$
   - Displays exact spine thickness in inches and millimeters.
   - Allows optional spine text if page count $\ge 79$ pages (Amazon KDP minimum for spine text).
3. **Back Cover Designer**:
   - Book description and blurb.
   - **Thumbnail Gallery**: Automatically renders 3–4 preview thumbnails of the best interior coloring pages on the back cover (a proven bestseller technique on Amazon).
   - Designated KDP barcode safe zone ($2.0" \times 1.2"$) in bottom-right corner to prevent content cutoff.

### Gate 5
- A user can design front cover artwork, verify spine thickness calculation, preview back cover with interior thumbnails, and position typography cleanly.

---

## Phase 6 — KDP-Ready PDF Compiler, Preview & Publishing Pack

### Objective
Compile the print-ready single-sided PDF, provide an interactive physical book previewer, and generate Amazon KDP publishing metadata.

### Deliverables
1. **Printable PDF Compiler (`coloringExportService.ts`)**:
   - Uses Puppeteer and pdf-lib for pixel-perfect PDF rendering:
     - Exact physical dimensions (e.g., $8.5 \times 11\text{ inches}$).
     - Safe margins: inside gutter $\ge 0.5\text{ in}$, outside margins $\ge 0.25\text{ in}$.
     - **Single-Sided Layout**:
       - Page 1: Title & copyright page.
       - Page 2: Blank page.
       - Page 3: Coloring illustration 1.
       - Page 4: Blank page (prevents physical marker bleed-through).
       - Page 5: Coloring illustration 2...
     - High-resolution 300 DPI raster embedding.
2. **Interactive Spread Previewer (`/app/coloring-book/:bookId/preview`)**:
   - Dual-page spread reader simulating a real physical book.
   - Left page shows blank back, right page shows coloring art.
   - Toggle overlays: Safe Margins, Gutter, and Cut Lines.
3. **Amazon KDP Publishing Package (`/app/coloring-book/:bookId/export`)**:
   - **Preflight Compliance Certificate**:
     - $\checkmark$ Total page count $\ge 24$ pages.
     - $\checkmark$ 300 DPI minimum resolution verified.
     - $\checkmark$ Single-sided blank back pages verified.
     - $\checkmark$ Safe print margins verified.
   - **Amazon KDP Metadata Kit**:
     - Optimized Amazon listing title and subtitle.
     - 7 high-traffic Amazon search keywords (e.g. *"cute animal coloring book for toddlers", "farm coloring pages for kids"*).
     - Recommended Amazon / BISAC categories.
     - Formatted Amazon HTML product description with bullet points.
     - Step-by-step KDP upload checklist.
   - One-click ZIP download containing Interior PDF, Cover PDF, and `KDP_METADATA.md`.

### Gate 6
- The user can preview the physical book spread, download a fully compliant KDP PDF with single-sided blank backs and 300 DPI resolution, and copy Amazon listing keywords and description directly into KDP.
