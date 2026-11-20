# Frontend development plan

Updated: 20 November 2026. Coordinate API dependencies through [README.md](./README.md) and [BACKEND.md](./BACKEND.md).

## 1. Architecture and design direction

Keep Next.js App Router, React, TypeScript, TanStack Query, React Hook Form/Zod, TipTap, and the current shared UI components. Use Zustand only where cross-component client state requires it; keep server-owned data in the query cache.

Follow the installed Next.js documentation and `frontend/AGENTS.md` when implementing frontend code. The project enables Cache Components and uses a same-origin API proxy; do not cache private user data across sessions.

Maintain the existing visual identity: coral accent, warm off-white backgrounds, white surfaces, readable typography, rounded controls, consistent icons, and generous spacing. Build the book editor and previews for multilingual and RTL manuscripts.

Existing locations:

| Location | Responsibility |
| --- | --- |
| `frontend/src/app` | Routes, layouts, metadata, and route boundaries |
| `frontend/src/components/app` | Shell, navigation, providers |
| `frontend/src/components/books` | Book workflow screens |
| `frontend/src/components/editor` | TipTap, toolbar, AI suggestions, autosave, history |
| `frontend/src/components/ui` | Shared controls, dialogs, alerts, states |
| `frontend/src/lib` | API client, query keys/hooks, types, utilities |
| `packages/shared/src` | Validation and domain contracts shared with the API |

## 2. Existing screens and behavior

| Area | Present in code | Remaining work |
| --- | --- | --- |
| Authentication | Login, signup, OTP verification, forgot/reset pages, conditional Google button | Deployment verification, expiry handling, broader browser coverage |
| App shell | Desktop/mobile navigation, session guard, wallet summary | New navigation groups, focus behavior and access states |
| Dashboard/library | Dashboard, book cards, search, empty state, deletion | Archive, filters, folders/projects, richer project status |
| Create | Book brief wizard and language preferences | Additional optional brief fields, import entry points, draft recovery |
| Outline | Title/chapter editing, reordering, approval | Version browser, nested sections, overlap/missing-topic review |
| Generation | Progress, cancellation, retry, editor handoff | Section-level durable progress and clearer partial-completion states |
| Editor | Rich text, tables, chapter navigation, autosave, OCC conflicts, AI suggestion review | Images/captions, search/replace, recovery, manual save and richer editing controls |
| History | Revision list, plain-text preview, safe restore | Optional comparison view and clearer long-history navigation |
| Export | PDF request, status/history, download | EPUB/DOCX, design preview, quality-report integration |
| Account | Credits ledger and basic profile settings | Paid billing, onboarding, broader account preferences |

Dedicated projects, image studio, design templates, quality, distribution, marketing, coloring-book, and admin screens remain planned.

## 3. Route plan

Keep existing book workflow routes. Proposed routes must only enter navigation when usable or clearly marked unavailable.

| Route | Status / purpose |
| --- | --- |
| `/` | Existing public landing page |
| `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | Existing authentication pages |
| `/app/dashboard` | Existing dashboard |
| `/app/create` | Existing book creation wizard |
| `/app/books` | Existing library |
| `/app/books/:bookId/outline` | Existing outline workspace |
| `/app/books/:bookId/generate` | Existing generation status |
| `/app/books/:bookId/editor` | Existing chapter editor and history |
| `/app/books/:bookId/export` | Existing PDF export; extend to other formats |
| `/app/credits`, `/app/settings` | Existing credits and profile pages |
| `/app/projects` | Planned project management |
| `/app/image-studio` | Planned book-scoped artwork and assets |
| `/app/templates` | Planned design templates and typography |
| `/app/quality` | Planned quality reports |
| `/app/distribution` | Planned publishing packages |
| `/app/marketing` | Planned marketing assets |
| `/app/billing` | Planned subscription and payment management; preserve credits navigation |
| `/app/coloring-book` | Later specialized workflow |
| `/app/feedback` | Planned feedback form with a real submission endpoint |
| `/admin/*` | Planned role-restricted administration |

Global studios should include a book picker and preserve book context in the URL. Define the selected-book parameter consistently before implementation.

## 4. M1 — Editor and core workflow reliability

- [ ] Add recoverable unsaved drafts keyed by user, chapter, and base server version. Define retention, logout cleanup, and restore/discard choices.
- [ ] Add a visible manual Save control and retain the keyboard shortcut. Show saving, saved timestamp, failure/retry, and conflict states consistently.
- [ ] Ensure chapter switches and navigation do not silently discard pending work. Flush saves or provide a clear recovery path.
- [ ] Review conflict resolution with two tabs, server changes during saves, offline reconnection, and history restores.
- [ ] Keep history actions unavailable during unsaved edits; pause editing without emitting content updates while previewing revisions.
- [ ] Preserve the current draft when restoring history, update the editor's concurrency version, and allow the next edit to save normally.
- [ ] Add selection-aware preview/accept/reject/retry for all AI edits. If the document changes while a suggestion is pending, revalidate the target range before applying it.
- [ ] Match generation states to backend durable progress, including partial chapters, cancellation requested, retryable failure, and resumed work.
- [ ] Explain session expiry without losing recoverable manuscript changes.

Acceptance: typing, saving, switching chapters, browser refresh, concurrent editing, AI suggestions, and version restores preserve the intended draft and show accurate status.

## 5. M2 — Projects, library, and book planning

- [ ] Build project create/edit/archive views, project book lists, and assignment/reassignment controls.
- [ ] Add library filters for project, language, type, and status; add sorting and paginated results.
- [ ] Separate archive from delete, and explain deletion effects before confirmation.
- [ ] Extend the wizard with optional purpose, style, point of view, reader problem/outcome, author/brand settings, and source preferences.
- [ ] Keep essential fields short and place advanced options behind progressive disclosure.
- [ ] Preserve incomplete wizard input and show language-aware estimates and generation credit cost.
- [ ] Add outline version browsing and restoration with unsaved-change handling.
- [ ] Extend outline structure to nested sections when supported by the backend; show chapter goals and word targets.
- [ ] Add review prompts for repeated or missing topics without implying that an automated outline is guaranteed complete.

Acceptance: a first-time user can create a book with defaults; an experienced user can configure and organize it without losing existing content.

## 6. M3 — Image studio, covers, and book design

### Image and asset studio

- [ ] Provide book selection, generated/uploaded asset library, image preview, selection, and deletion rules.
- [ ] Add cover concept generation with style, palette, aspect ratio, prompt, and visible credit estimate.
- [ ] Show queued/running/failed/completed image jobs and allow retry without hiding previously generated concepts.
- [ ] Implement editable title, subtitle, and author overlays independent of generated artwork.
- [ ] Add typography, alignment, positioning, contrast controls, and safe bounds for cover text.
- [ ] Add interior illustration generation and insertion into chapters with editable alt text and captions.
- [ ] Save book-level visual direction and apply it as the default for later illustrations.

### Design and preview

- [ ] Build a template gallery with previews and clear digital versus print applicability.
- [ ] Add typography, heading styles, spacing, margins, trim size, chapter openings, and front/back matter controls.
- [ ] Persist design changes and make template application reversible.
- [ ] Add desktop/tablet/mobile reader widths and font-size controls for reflowable previews.
- [ ] Add a separate print-layout preview with page numbers and appropriate headers/footers.
- [ ] Share rendering rules with exports where practical and identify where a browser preview differs from a generated file.

Acceptance: the user can generate or upload artwork, edit cover text, apply a design, reopen the book, and see the saved choices reflected in previews and exports.

## 7. M4 — Quality reports and multi-format export

- [ ] Build a quality overview with category results, critical findings, warnings, and suggestions.
- [ ] Link findings to the affected chapter/section and keep a stable navigation target when possible.
- [ ] Distinguish deterministic checks, AI suggestions, and factual/citation issues needing human review.
- [ ] Identify stale reports when the manuscript changes and offer a new review.
- [ ] Extend the export screen with PDF, EPUB, and DOCX format selection and supported options.
- [ ] Separate digital PDF, print-oriented PDF, and reflowable EPUB design choices.
- [ ] Display pre-export findings and format-specific limitations before requesting a file.
- [ ] Show processing and validation states; enable download only when the backend confirms a validated file is ready.
- [ ] Show format, creation time, size, applicable page count, validation findings, and retryable failures in export history.
- [ ] Provide a useful recovery message when a stored file is unavailable.

Acceptance: the user can review findings, fix a chapter, rerun the checker, and download each supported format without receiving a false success message.

## 8. M5 — Distribution and marketing

- [ ] Build a distribution center with separate Amazon KDP eBook/print flows and Apple Books, Etsy, Gumroad, and own-website preparation options.
- [ ] Collect destination-specific metadata, preview the package contents, and download the final package.
- [ ] Show actionable checklists and user-managed publishing status. Use preparation language until real integrations exist.
- [ ] Build marketing asset generation for descriptions, bios, sales copy, emails, keywords, captions, carousels, and short-video scripts.
- [ ] Provide preview, edit, copy, regenerate, variant history, and download actions backed by persisted data.
- [ ] Add optional promotional graphics after the text workflow and asset pipeline are reliable.

Acceptance: a user can leave with platform-specific files and editable launch materials; every visible publishing or marketing action has a real result.

## 9. M6 — Billing, settings, and administration

- [ ] Add plan comparison using backend-provided prices, allowances, and entitlements.
- [ ] Add checkout, subscription status, renewal/cancellation details, top-ups, and provider billing-portal access.
- [ ] Keep available and reserved credits distinct; show the cost before paid actions and provide transaction history.
- [ ] Handle pending, failed, and duplicate payment confirmations through server state. A browser redirect alone must not grant credits.
- [ ] Add onboarding preferences, author profile, language, brand defaults, and notification settings as supporting APIs become available.
- [ ] Build an admin shell gated by server-enforced roles, with dashboard, users, books, subscriptions, transactions, credits, AI usage, jobs, templates, reports, settings, and audit history.
- [ ] Require explicit reasons for sensitive admin actions and show their recorded outcomes.

Acceptance: billing UI reflects verified entitlements and failures; ordinary users cannot access privileged data or actions through direct navigation or requests.

## 10. Shared interaction requirements

- Provide loading, empty, validation, success, error/retry, disabled, and permission states wherever applicable.
- Use accessible names, visible focus, keyboard-operable dialogs/menus, and appropriate focus return after closing overlays.
- Check contrast and reduced-motion behavior. Do not encode severity or status using color alone.
- Keep long titles, translated labels, RTL text, large tables, and mobile toolbars usable.
- Scope query keys by resource and clear private cached data appropriately at logout/account change.
- Avoid background document refetches that overwrite an open editor. Update the cache deliberately after saves and restores.
- Use shared schemas and API types instead of drifting local copies as contracts evolve.
- Show unavailable features honestly; avoid decorative controls that imply completed capabilities.

## 11. M7 — Testing and release evidence

Current checks:

```sh
pnpm --filter frontend typecheck
pnpm --filter frontend lint
pnpm --filter frontend build
pnpm e2e
```

The existing Puppeteer journey covers registration/OTP, wizard validation, outline approval, mock writing, autosave, version preview/restore, AI suggestions, PDF download, credits, and a mobile dashboard check. It requires the live frontend, API, matching worker, PostgreSQL, Redis, and Mailpit. `SKIP_SCREENSHOTS=1 pnpm e2e` runs the functional journey without screenshot capture.

- [ ] Add Playwright coverage incrementally or migrate the existing suite while preserving the working journey.
- [ ] Add focused tests for two-tab conflicts, offline recovery, session expiry, cancelled/retried generation, and stale AI suggestions.
- [ ] Test empty/error/permission states and direct navigation to protected and missing resources.
- [ ] Test image uploads, cover editing, quality-report navigation, billing failures, and destination packages as they ship.
- [ ] Verify actual downloaded files and backend credit changes, rather than relying only on UI labels.
- [ ] Test desktop and mobile layouts, keyboard-only navigation, RTL, long manuscripts, and accessibility.
- [ ] Add performance budgets for editor responsiveness and studio loading, then measure representative books.
- [ ] Verify the release build and deployed environment separately from the development server.

Wait for concrete state transitions in browser tests. The editor's saved indicator or enabled History control is a stronger signal than searching manuscript text for “Saved”. Test API and workers must share storage and consume an isolated queue.

## 12. Later releases

Source research workspace, advanced consistency review, coloring-book studio, advanced design customization, a sales landing-page builder, agency/client workspaces, teams, white-label branding, and enterprise analytics follow the launch workflow. Add these only with the corresponding persistence, permission, and generation contracts.
