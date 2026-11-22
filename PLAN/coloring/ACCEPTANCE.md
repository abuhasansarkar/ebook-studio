# Acceptance Criteria & Release Checklist: AI Coloring Book Studio

---

## 1. Acceptance Gates by Phase

### Phase 1: Foundation, Schemas & Free AI Planner
- [ ] **Contract Validation**: `coloringBookBriefSchema` and `coloringPlanSchema` reject invalid payloads and correctly normalize defaults.
- [ ] **Free Planning**: Calling `POST /coloring/plan` creates the book and 24–60 page scene records in PostgreSQL and charges **0 credits**.
- [ ] **Deterministic Mock Support**: When `AI_MOCK=1`, planning returns consistent, structured titles and scene prompts without calling OpenAI.
- [ ] **Wizard UI**: 4-step wizard loads cleanly, validates each step before allowing progress, and redirects to `/app/coloring-book/:bookId/plan`.
- [ ] **Plan Editing**: Editing any scene title or prompt persists to the database immediately; plan approval marks `approvedAt`.

### Phase 2: Line-Art Generation & Independent Page Control
- [ ] **Prompt Compiler Integrity**: `buildColoringPrompt` strictly includes pure black-and-white, pure white background (`#FFFFFF`), closed outlines, and negative constraints across all 12 styles.
- [ ] **Single-Page Regeneration**:
  - Clicking "Regenerate" on Page 8 charges exactly **8 credits**.
  - Only Page 8 updates its `assetId`, `qualityChecks`, and image preview.
  - Pages 1–7 and 9–24 remain completely untouched in the database.
- [ ] **Credit Ledger Atomicity**:
  - If a page generation fails, the 8 reserved credits are refunded automatically via `settleInTransaction`.
  - Double-clicking or network retries do not double-charge due to idempotency keys.
- [ ] **Batch Queue**:
  - "Generate All Pending" reserves `pendingCount * 8` credits and processes pages sequentially/concurrently with live UI progress updates.

### Phase 3: Visual Page Editor & Arranger
- [ ] **Drag & Drop Reordering**: Reordering page cards updates `pageNumber` sequence in a single database transaction without gaps or duplicates.
- [ ] **Custom Art Upload**: User can upload a PNG/SVG line art file to replace an illustration; Sharp sanitizes the image and saves the `Asset`.
- [ ] **Add / Delete Pages**: Adding a page appends a new pending page; deleting a page re-indexes remaining pages safely.

### Phase 4: Automated Quality Inspector
- [ ] **Background Whiteness**: Sharp correctly flags images with off-white or gray background wash ($< 98\%$ brightness).
- [ ] **Monochrome Verification**: Detects and flags any non-zero saturation (chromatic color contamination).
- [ ] **300 DPI Preflight**: Verifies dimensions meet print requirements ($\ge 2550 \times 3300\text{ px}$ for $8.5 \times 11\text{ in}$).
- [ ] **Actionable UI**: Dashboard displays circular health score and provides 1-click "Auto-Clean Lines" or "Regenerate".

### Phase 5: Cover Studio & Spine Calculator
- [ ] **Front Cover Generation**: Generates full-color illustration with clean editable typography.
- [ ] **Spine Width Calculation**: Exact KDP formula:
  $$\text{Spine Width} = \text{Interior Pages} \times 0.002252\text{ in}$$
  Accurate to 3 decimal places.
- [ ] **Back Cover Gallery**: Automatically renders 3–4 preview thumbnails of interior line-art pages.
- [ ] **Barcode Safe Zone**: Visual indicator ensures no text or artwork overlaps the $2.0" \times 1.2"$ KDP barcode zone.

### Phase 6: KDP-Ready PDF Compiler, Preview & Publishing Pack
- [ ] **Printable PDF Compilation**:
  - Generates single-sided layout: Odd page = illustration, Even page = blank back page.
  - Total physical page count $\ge 24$ (e.g. 24 scenes = 50 pages with title/copyright).
  - Safe margins: inside gutter $\ge 0.5\text{ in}$, outside margin $\ge 0.25\text{ in}$.
  - Embedded raster illustrations render crisp at 300 DPI without blurriness.
- [ ] **Two-Page Spread Previewer**: Simulates physical paper spread smoothly in the browser.
- [ ] **Amazon KDP Package**:
  - Generates 7 search keywords tailored to the book's topic and style.
  - Generates HTML formatted book description.
  - Downloadable ZIP containing Interior PDF, Cover PDF, and `KDP_METADATA.md`.

---

## 2. Automated Test Commands

```bash
# 1. Typecheck shared package, backend, and frontend
pnpm -r typecheck

# 2. Run backend coloring unit & service tests
pnpm --filter backend test tests/coloring.test.ts

# 3. Verify frontend builds with zero route errors
pnpm --filter frontend build
```

---

## 3. Manual Verification Journey

1. **Create Book**: Navigate to `/app/coloring-book/create` $\rightarrow$ Enter *"Cute woodland animals having tea parties"* $\rightarrow$ Select *"Kawaii Chibi"* style $\rightarrow$ 24 pages $\rightarrow$ Click *"Generate Book Plan"*.
2. **Review Plan**: Verify 24 unique, charming tea party scenes are planned $\rightarrow$ Edit Page 3 prompt $\rightarrow$ Click *"Approve Plan"*.
3. **Generate Pages**: Click *"Generate All Pending"* $\rightarrow$ Watch progress counter advance $\rightarrow$ Verify images appear on pure white paper cards.
4. **Test Single-Page Regeneration**: Click *"Regenerate"* on Page 5 with tweak *"Add tiny honey jars on the picnic blanket"* $\rightarrow$ Confirm 8 credits spent $\rightarrow$ Verify only Page 5 updates.
5. **Quality Check**: Navigate to `Quality` tab $\rightarrow$ Verify 100% score for clean line art.
6. **Design Cover**: Navigate to `Cover` tab $\rightarrow$ Generate colorful front art $\rightarrow$ Check spine calculation.
7. **Export & Inspect PDF**: Download interior PDF $\rightarrow$ Open in PDF viewer $\rightarrow$ Verify Page 1 title, Page 2 blank, Page 3 illustration, Page 4 blank.
