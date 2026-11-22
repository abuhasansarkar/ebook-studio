# AI Coloring Book Studio — Roadmap & Blueprint

> **Status:** Architecture & Phased Implementation Plan  
> **Target:** Seamless integration into eBookStudio as a dedicated visual-first studio product.

---

## 1. Product Vision

Standard eBooks are text-driven (chapters, words, paragraphs). Coloring books are entirely visual and physical products with distinct artistic, production, and marketplace requirements. 

**AI Coloring Book Studio** provides an end-to-end, delightful, and intuitive workflow where users can transform an idea into an Amazon KDP print-ready coloring book in minutes:
- **Zero-barrier idea exploration:** Free concept & page planning.
- **Consistent artistic line-art:** Curated styles, strict prompt compilation, and pure white vector-clean backgrounds.
- **Independent page control:** Regenerate, edit, or replace individual pages without touching or paying for the rest of the book.
- **Quality automation:** Computer-vision checks detecting dark spots, color spills, muddy grayscale, or low resolution.
- **KDP-ready print engine:** Proper trim sizes, single-sided printing with blank back pages, 300 DPI preflight, spine calculation, and publishing metadata.

---

## 2. Core UI/UX Design Principles: Clean, Simple & Delightful

To ensure the studio is genuinely **easy to use** and features a **clean, modern UI design**, every screen adheres to these five design pillars:

1. **Zero Clutter, Progressive Disclosure:**
   - Instead of overwhelming forms, settings are grouped into a progressive 4-step visual creation wizard.
   - Advance settings (bleed, gutter, prompt weights, negative prompts) are cleanly tucked away under thoughtful expanders with sensible defaults.
2. **Visual-First Controls:**
   - Art styles are chosen via visual art cards with real style previews, not boring plain text dropdowns.
   - Page overview displays a responsive masonry/grid with high-res thumbnails, status badges, and instant hover actions.
3. **Transparent & Fair Credit Feedback:**
   - Planning is always visibly labeled **FREE (0 credits)**.
   - Credit counters clearly communicate expected costs *before* any button is clicked (e.g., *"Generates 1 page • 8 credits"*).
   - If a user regenerates Page 8, they only spend 8 credits for Page 8 — no hidden or repeated charges.
4. **Physical Book Reality in the Browser:**
   - The previewer simulates a real physical book spread (Right: Illustration, Left: Blank back page to prevent marker bleed-through).
   - Real-time margin guides and trim bleed lines give users immediate confidence for physical printing.
5. **Clear, Helpful Microcopy:**
   - No confusing technical jargon. Instead of *"Raster pixel histogram fails binarization threshold"*, the UI displays: *"Notice: Slight gray shading detected — Click 'Fix Line Art' to sharpen to pure black & white"*.

---

## 3. Navigation Hierarchy & Studio Routes

The Coloring Book Studio lives under its own dedicated routes within eBookStudio:

```text
/app/coloring-book                         -> Coloring Books Library / Dashboard
/app/coloring-book/create                  -> 4-Step Visual Creation Wizard
/app/coloring-book/:bookId/plan            -> Phase 1: Concept & AI Page Planner (Free)
/app/coloring-book/:bookId/pages           -> Phase 2: Page Grid & Batch / Single Generation
/app/coloring-book/:bookId/editor          -> Phase 3: Detailed Scene & Prompt Editor
/app/coloring-book/:bookId/quality         -> Phase 4: Line-Art & Print Preflight Quality Check
/app/coloring-book/:bookId/cover           -> Phase 5: Cover Studio (Front Art, Spine, Back Cover)
/app/coloring-book/:bookId/preview         -> Phase 6: Interactive 2-Page Spread Reader Preview
/app/coloring-book/:bookId/export          -> Phase 6: KDP Print-Ready PDF & Publishing Package
```

---

## 4. Phased Implementation Overview

The implementation is broken down into **6 logical, sequential phases**:

| Phase | Title | Core Focus | User-Facing Value |
|---|---|---|---|
| **Phase 1** | **Foundation, Shared Contracts & Free AI Planner** | Schemas, DB models, wizard, concept & 24–60 page prompt planning | User can plan a complete coloring book idea for free with zero credits |
| **Phase 2** | **Line-Art Generation Engine & Independent Page Control** | Queue workers, OpenAI line-art prompt compiler, single-page & batch generation | User can generate all illustrations or regenerate single pages independently |
| **Phase 3** | **Visual Page Editor & Arranger** | Drag-and-drop reordering, custom prompt editor, replacement upload, page captions | User can customize prompts, reorder scenes, or upload custom art |
| **Phase 4** | **Automated Quality Inspector** | Pure white background check, color/grayscale detection, 300 DPI validation | User gets instant visual alerts and 1-click line-art fixes for print compliance |
| **Phase 5** | **Cover Studio & Spine Calculator** | Vibrant full-color front cover, exact spine thickness math, back-cover thumbnails | Complete wrap-around KDP paperback cover design |
| **Phase 6** | **KDP-Ready PDF Compiler, Preview & Publishing Pack** | Single-sided blank back pages, Puppeteer/pdf-lib print engine, Amazon listing copy | Download 300 DPI print-ready PDF and copy-paste Amazon KDP metadata |

---

## 5. Related Documents

- [PHASES.md](./PHASES.md): Step-by-step breakdown of each phase, deliverables, and completion gates.
- [FRONTEND_UI_UX.md](./FRONTEND_UI_UX.md): Clean UI component specifications, design tokens, layouts, and user interactions.
- [BACKEND.md](./BACKEND.md): Data models, queue architectures, prompt engineering, Sharp image pipelines, and API specs.
- [ACCEPTANCE.md](./ACCEPTANCE.md): Testing scenarios, automated checks, and release checklists.
