# Detailed frontend implementation plan

Implement matching S01–S16 packages from [IMPLEMENTATION_ORDER.md](./IMPLEMENTATION_ORDER.md). Define API dependencies through [BACKEND.md](./BACKEND.md) and prove journeys through [ACCEPTANCE.md](./ACCEPTANCE.md).

## Architecture and interaction rules

Keep Next.js App Router, React, TypeScript, TanStack Query, React Hook Form/Zod and TipTap. Read `frontend/AGENTS.md` and installed Next.js documentation before code changes. Retain current components and working routes.

Use TanStack Query for server-owned state, component state for local interactions and IndexedDB for explicitly scoped recovery drafts. Add cross-component stores only when needed. Keep private user data out of shared server caches and clear account-specific query state on logout/account switching.

Extend existing locations: `frontend/src/app`, `components/{app,books,editor,ui}`, `lib/{api,queries,types}`, and shared validation in `packages/shared`.

Design remains coral-accented with warm backgrounds, readable surfaces, consistent controls and visible focus. Product implementation details belong in support/admin views, not customer-facing flows unless they help a user decide what to do.

### Requirements applied to every screen

- Support loading, empty, validation, disabled, success, error/retry, permission and not-found states as applicable.
- Use labels, keyboard interactions, visible focus, meaningful announcements and correct focus return after dialogs. Status must not depend only on color.
- Bound lists with pagination and keep long titles, tables, translated labels and mobile controls usable.
- Keep estimates separate from completed charges. Confirm expensive actions with cost/remaining credit information.
- Handle 401/session expiry, 402/credits, 403/permission, 409/conflict, 429/throttling and transient service failures consistently.
- Preserve edits while showing server errors. Never use a background refetch to overwrite the open manuscript.
- Keep primary actions usable on touch screens; expose alternative controls for drag-and-drop.
- Test Bengali/English/mixed script, Arabic RTL and representative CJK content throughout the workflow.
- Use a common `bookId` URL query parameter for global studios so refresh and shareable internal links preserve book context; enforce access through the API.
- Use capability/entitlement responses to expose only supported actions; hiding a button does not replace API authorization.

## S01 — Shared API behavior and operation status

Routes/components: retain the app shell, existing book workflow, API client and query hooks; introduce shared operation status and request-error components.

Tasks:

- [ ] Map shared API schemas/statuses into typed query hooks instead of maintaining drifting response copies.
- [ ] Add consistent pagination, operation polling/backoff, timeout/reconnect and cancellation-requested behavior.
- [ ] Include safe request IDs in support details; keep stack traces/provider payloads out of customer messages.
- [ ] Add centralized auth-expiry handling and account-specific cache cleanup.
- [ ] Handle request idempotency across repeat clicks and uncertain responses; retry the same operation identity rather than silently creating a new paid job.
- [ ] Preserve compatibility while backend endpoint contracts migrate.

Gate: operation status survives refresh, repeat submissions remain one operation and errors provide a meaningful next action.

## S02 — Editor saves and local draft recovery

Routes/components: extend `chapter-editor.tsx`, `use-autosave.ts`, `version-history.tsx`, `ai-assist.tsx`, toolbar and book editor screen; add recovery storage and draft/conflict dialogs.

Tasks:

- [ ] Add a visible Save button with saved timestamp and dirty/saving/offline/error/conflict states; retain Cmd/Ctrl+S.
- [ ] Persist a recovery journal to IndexedDB using user ID, chapter ID, base server version, document schema version, title/content and timestamps.
- [ ] Persist recovery data before attempting network saves; clear only the snapshot acknowledged by that save so newer edits survive.
- [ ] Handle browser storage quota/denial explicitly. Explain that recovery is device-specific; do not imply cross-device backup.
- [ ] Compare local/server versions on open: offer preview, restore through OCC, discard or keep both where appropriate. Never automatically overwrite the server.
- [ ] Flush or preserve pending edits on chapter switch/navigation; show a clear warning when safe persistence cannot finish.
- [ ] Define logout/account-switch handling without displaying one user's drafts to another. Document retention and shared-device choices.
- [ ] Pause autosave retries on unresolved conflicts; let users load the server draft, preserve their own copy or submit an explicit conflict resolution.
- [ ] Keep history unavailable while unsaved; preview in read-only mode without emitting content updates; adopt the new OCC version after restore.
- [ ] Validate AI suggestion ranges/base versions before acceptance; preserve accept/reject/retry and show stale-suggestion recovery choices.
- [ ] Add search/replace with review of matches and undo support; extend editing controls for links, lists, tables and accessible chapter reordering.

Gate: refresh/crash/offline/two-tab scenarios retain recoverable work; manual save, history restore and the next edit behave correctly.

## S03 — Durable writing progress and controls

Routes/components: generation screen, book header/status, chapter navigation and shared operation status.

Tasks:

- [ ] Show approved outline version, estimated credits and current generation scope before starting.
- [ ] Display section/chapter progress from persisted server state, including partial content, queued work and completed units.
- [ ] Make resume, retry and start-over semantics distinct. Preserve completed writing by default.
- [ ] Show cancellation requested until the server confirms the terminal state; show final charges and released reservations.
- [ ] Recover the active operation after refresh/session reauthentication; do not create another job automatically.
- [ ] Allow editing completed chapters only when the backend permits it; protect units still being generated.
- [ ] Surface model-output concerns or incomplete chapters without marking the book finished prematurely.

Gate: interrupted generation can be resumed from another page visit; progress and credit information match server records.

## S04 — OTP request, resend and recovery states

Routes/components: signup, verify-email, login, forgot/reset password and OTP input; optional operator delivery view arrives in S13.

Tasks:

- [ ] Use neutral wording such as “If the account is eligible, a code will be sent” when delivery/account existence is not confirmed.
- [ ] Distinguish request submission, cooldown, verification in progress, invalid/expired code, attempt limit and temporary service failure.
- [ ] Use server retry/cooldown policy where exposed; browser timers are only a convenience, not enforcement.
- [ ] Support accessible paste/autofill, leading-zero six-digit codes and prevention of duplicate auto-submit/manual-submit requests.
- [ ] Preserve safe return URLs and email context across resend/reset; never store OTP values in analytics, recovery drafts or URLs.
- [ ] Explain Inbox/Spam checks without promising inbox delivery or exposing whether an account exists.
- [ ] Verify the password reset completion flow and recovery from expired tokens; enable email-change UI only if the full secured API flow is implemented.

Gate: signup, resend, sign-in where exposed and reset journeys behave correctly during delays, expiry and throttling; a neutral HTTP response is not shown as confirmed SMTP delivery.

## S05 — Projects, library and outline planning

Routes/components: `/app/projects`, existing library/create/outline routes; project cards/forms, library filters and outline history dialog.

Tasks:

- [ ] Build create/edit project, book assignment, project details and archive/restore actions.
- [ ] Add project/language/type/status filters, sorting and pagination with filter state in the URL.
- [ ] Separate archive, duplicate and delete actions; show impact and preserve existing content appropriately.
- [ ] Extend optional brief fields using progressive disclosure; keep a short path with sensible defaults.
- [ ] Recover an unfinished wizard independently of manuscript recovery and show generation estimates before submission.
- [ ] Add outline version list/preview/restore and a clearly version-bound approval state.
- [ ] Support nested sections when provided by the API; expose goals, word targets and accessible reorder controls.
- [ ] Before structural changes to a written book, show affected chapters and the backend-supported preservation/mapping choices.

Gate: a user can organize multiple books, find archived work and recover earlier planning without silently losing manuscript content.

## S06 — Asset uploads and library

Routes/components: `/app/image-studio?bookId=...`, reusable asset picker/uploader and editor image controls.

Tasks:

- [ ] Show supported types/limits before upload; display progress, processing/quarantine, available and failed states.
- [ ] Allow file selection, cancellation and retry; do not claim an interrupted upload completed.
- [ ] Build private asset browsing with thumbnails, metadata, alt text/caption editing and reference information.
- [ ] Keep signed preview links refreshed only for authorized users; handle expiry/unavailable files without exposing raw storage keys.
- [ ] Show why referenced assets cannot be deleted and offer supported replacement actions.
- [ ] Insert approved asset IDs into the manuscript, with responsive image layout, caption and accessibility controls.

Gate: upload → process → choose → insert → reopen works; invalid files and foreign assets cannot become usable manuscript content.

## S07 — Cover and illustration studio

Routes/components: extend image studio with cover concepts, editable cover composition and illustration modes.

Tasks:

- [ ] Provide book context, prompt, style/palette/aspect controls and a credit estimate before generation.
- [ ] Show generation history and allow selecting existing concepts, uploading artwork or regenerating while keeping prior results.
- [ ] Keep title/subtitle/author text editable separately from artwork; add licensed font, size, color, alignment and position controls.
- [ ] Provide drag controls plus numeric/keyboard alternatives, text safe bounds and contrast feedback.
- [ ] Save composition changes with OCC; preserve undo/redo and show conflict/recovery choices.
- [ ] Preview composed cover output and download its actual rendered high-resolution file.
- [ ] Apply book-level visual direction to interior illustrations; insert selected images through the asset picker.

Gate: users reopen their design, change text without buying new artwork, and obtain a cover matching the saved composition across language fixtures.

## S08 — Templates, typography and reader preview

Routes/components: `/app/templates?bookId=...`; add book design controls and reader preview access in the book workflow.

Tasks:

- [ ] Build a template gallery showing intended use, typography and digital/print applicability.
- [ ] Preview before applying, show affected settings and preserve a reversible design version.
- [ ] Add body/heading fonts, spacing, margins, trim size, chapter-opening and table/image styles supported by the backend.
- [ ] Add title/copyright/dedication/author/reference matter editing with clear optional/required fields.
- [ ] Add desktop/tablet/mobile reading widths and adjustable reader font size for reflowable previews.
- [ ] Provide a distinct print preview with applicable page numbers, margins and headers/footers.
- [ ] Load approved fonts with predictable fallback/error indicators; preserve Bengali shaping and RTL/mixed-script reading order.
- [ ] Explain differences between an interactive browser preview and the final generated artifact; link to actual file preview where possible.

Gate: saved design settings survive reload, template changes can be undone and print-only features do not leak into the reflowable reader.

## S09 — Quality and consistency workspace

Routes/components: `/app/quality?bookId=...`, report overview, finding filters, review panel and editor finding navigation.

Tasks:

- [ ] Show review scope, input version, cost where applicable, progress and category results.
- [ ] Separate deterministic defects, AI suggestions and factual/citation concerns needing human review.
- [ ] Filter findings by severity/category/chapter and navigate to stable content anchors with a visible highlight.
- [ ] Keep evidence excerpts and review status attached to findings; require an explicit user action for any fix.
- [ ] Explain stale/missing anchors after edits and offer rerun/review rather than highlighting unrelated text.
- [ ] Add voice/terminology preferences and consistency context editing where supported.
- [ ] Avoid presenting scores as certification; disclose incomplete checks and unresolved human-review issues.

Gate: users find and address known defects, can distinguish stale reports, and never lose manuscript edits while switching between report and editor.

## S10 — Export options, validation and history

Routes/components: extend `/app/books/:bookId/export` with format/options selection, validation details and artifact history.

Tasks:

- [ ] Add PDF, EPUB and DOCX selection, showing only implemented combinations of format and design options.
- [ ] Separate digital PDF/print preparation from reflowable EPUB settings; display relevant metadata and cover selection.
- [ ] Show empty chapters, stale quality reports, missing assets and format-specific blocking findings before requesting export.
- [ ] Identify the manuscript/design version used by each export and warn when newer edits exist.
- [ ] Show queued/rendering/validating/uploading/ready/failed status with actionable diagnostics from supported backend states.
- [ ] Enable download only after the server confirms readiness; handle missing/revoked/expired artifacts.
- [ ] Show format, creation date, size, applicable page count and validation warnings; provide explicit retry/regenerate actions.
- [ ] Offer links/instructions for inspecting the actual generated file in relevant readers/editors.

Gate: real downloads open and match selected inputs; no UI success is based only on request acceptance or a guessed filename.

## S11 — Import and research workspace

Routes/components: add an import entry to creation/library and `/app/research?bookId=...`; source list/detail, extraction preview, chapter-source picker and evidence viewer.

Tasks:

- [ ] Let users choose notes, DOCX or supported PDF input and explain extraction/OCR limitations before upload.
- [ ] Show source provenance, permission reminder, processing progress and extraction warnings.
- [ ] Preview chapter mapping and extracted content; require confirmation before creation/merge and protect existing manuscripts.
- [ ] Keep import failure and retry independent from the original source file and existing book content.
- [ ] Add source organization, chapter associations, excerpts and stable page/paragraph navigation.
- [ ] Show source-based summaries/Q&A with supporting passages; distinguish absent support and generated interpretation.
- [ ] Warn when citations reference changed/deleted sources and connect these to quality reports.
- [ ] Expose URL import only after backend protections and supported extraction are available.

Gate: imported content remains editable; duplicate confirmation creates no duplicate chapters; source answers and citation clicks open genuine supporting passages.

## S12 — Plans, checkout and entitlements

Routes/components: `/app/billing`, existing credits screen, plan catalog, checkout handoff, purchase status and entitlement-aware actions.

Tasks:

- [ ] Display backend-provided prices/currency, billing interval, included usage, limits and applicable terms.
- [ ] Explain available versus reserved credits and the estimated cost of each paid action.
- [ ] Start checkout with a server-created session; show pending confirmation after returning until verified server state arrives.
- [ ] Handle abandoned checkout, failure, renewal/grace, cancellation and top-up states with clear next actions.
- [ ] Add billing portal access and subscription actions only where the provider/backend supports them.
- [ ] Keep restricted feature prompts consistent with entitlements; preserve readable/exportable user work according to published downgrade policy.
- [ ] Add paginated credit/usage history and accessible receipts/provider links where available.

Gate: browser redirects cannot unlock features by themselves; billing and wallet views reconcile with verified backend events.

## S13 — Administration, support and operations

Routes/components: `/admin/dashboard`, users, books, subscriptions, transactions, credits, AI usage, jobs, deliveries, templates, reports, settings and audit logs; `/app/feedback` for user support.

Tasks:

- [ ] Build a separate admin shell with role-aware navigation and explicit permission-denied states; rely on backend enforcement for all data.
- [ ] Add searchable/paginated operational views and correlation-ID links; limit sensitive content visibility.
- [ ] Show job/delivery failure type, attempts, expiry and safe retry/cancel availability without exposing OTPs or secrets.
- [ ] Require reasons/confirmation for privileged adjustments and show the recorded audit result.
- [ ] Add usage/cost/failure dashboards using server aggregates with clearly stated time ranges and definitions.
- [ ] Add backup/restore status views for authorized operators without displaying access credentials or triggering destructive restore casually.
- [ ] Add a working feedback form with submission success/error, rate-limit handling and support reference.

Gate: unauthorized direct navigation exposes no privileged data; admin actions have auditable results and support staff can follow a failed workflow safely.

## S14 — Distribution center

Routes/components: `/app/distribution?bookId=...`, destination selector, metadata form, checklist, package preview/history and download.

Tasks:

- [ ] Provide separate KDP eBook/print choices and Apple Books, Etsy, Gumroad and own-website preparation profiles.
- [ ] Show required metadata/files and the profile's rules review/version information where useful.
- [ ] Let users select validated manuscript/cover versions and review the package manifest before generation.
- [ ] Show blockers, package progress, file list, stale-input status and actual ZIP download.
- [ ] Track user-entered preparation/submission/published status with manual attribution and optional listing links.
- [ ] Use preparation language; expose no “publish now” or account-connection control without a real supported integration.

Gate: a user downloads a package with the exact selected files and understands what must still be done on the destination platform.

## S15 — Marketing studio

Routes/components: `/app/marketing?bookId=...`; output-type picker, brand/context controls, variants, text editor and graphic composition/download.

Tasks:

- [ ] Offer product descriptions, summaries, bios, sales copy, keywords, email drafts, captions, carousel outlines and short-video scripts.
- [ ] Show book/version context, audience/tone and credit estimate before generation.
- [ ] Allow preview/edit/save/copy/download and regeneration into a new variant; preserve manual edits.
- [ ] Flag stale book inputs and distinguish generated draft from user-approved material.
- [ ] Add promotional graphic templates using saved covers and editable text, then preview actual exported graphics.
- [ ] Add sample-chapter selection/download tied to a manuscript snapshot.
- [ ] Flag unsupported endorsements/claims for review and avoid claiming performance guarantees.
- [ ] Keep external posting/email sending outside this scope; downloading a draft must not trigger a campaign.

Gate: launch assets remain editable and reusable, reflect actual book content and download without unintended external actions.

## S16 — Full release validation

- [ ] Run browser journeys on the release build and deployed staging environment, including every new route/action and error state.
- [ ] Expand or migrate Puppeteer coverage to Playwright while preserving current functional assertions; do not equate migration with new coverage.
- [ ] Cover offline recovery, two-tab conflicts, expired sessions, image jobs, quality navigation, three export downloads, billing failures and package contents.
- [ ] Verify phone/tablet/desktop, keyboard-only navigation, focus/dialog behavior, screen-reader labels, contrast and reduced motion.
- [ ] Measure editor responsiveness and initial load with representative long books and assets; record approved budgets and regressions.
- [ ] Verify manuscript language support across editing, preview and actual files, not just a language dropdown.
- [ ] Review empty/failed/cancelled/permission states and remove unsupported claims or dead controls.
- [ ] Record evidence and known limitations in the release checklist before enabling capabilities for all users.

Existing commands: `pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`, `pnpm --filter frontend build`, `pnpm e2e`.

Use a dedicated Mailpit/mock-AI environment for ordinary browser tests; the current OTP test harness reads Mailpit and should not be pointed at real Gmail. Wait for actual saved/operation state before navigation, not words appearing in manuscript text.

## Route integration and navigation

Retain `/app/dashboard`, `/app/create`, `/app/books`, existing book outline/generate/editor/export routes, `/app/credits` and `/app/settings`. Add planned routes only when their backend capability is usable. Global projects/research/image/template/quality/distribution/marketing/billing pages preserve book context where relevant.

Group navigation around creating, organizing, designing, reviewing, publishing preparation and account management. Keep long studios accessible on mobile and provide a clear return to the current book. Avoid adding sixteen permanent sidebar items merely because the plan has sixteen steps.


## Marketplace priority update — 20 November 2026

See [MARKETPLACE_RELEASE.md](./MARKETPLACE_RELEASE.md) for the requested KDP/Etsy/Gumroad release sequence, implemented destination checks, and remaining gates. Current editor and marketplace verification is recorded in [ACCEPTANCE.md](./ACCEPTANCE.md); roadmap specifications elsewhere in this document must not be read as completion claims.


## S03/S04 implementation checkpoint

Generation snapshots/checkpoints, worker fencing, transactional reservations/settlement, and durable encrypted OTP delivery are implemented. Saved-section recovery status and neutral OTP wording are integrated in the frontend. See the dated [acceptance evidence](./ACCEPTANCE.md) and runtime/email runbooks for tested scenarios and remaining cutover limits. S05 is next; later specifications remain planned rather than implied complete.


## S05 implementation checkpoint

Core project management, library filtering/pagination, archive/restore, independent duplication, richer brief fields/recovery, and version-bound outline history are implemented and locally verified. Restoring planning preserves written chapters; destructive mapping and nested sections remain unsupported. See [ACCEPTANCE.md](./ACCEPTANCE.md) for the 72-test and browser evidence, API token changes, and specific UX/recovery limits. S06 private assets is next.
