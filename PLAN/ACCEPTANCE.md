# Acceptance tests and release evidence

This checklist defines completion for the sixteen steps in [IMPLEMENTATION_ORDER.md](./IMPLEMENTATION_ORDER.md). A checked box must link to evidence from a named environment/commit; implementation presence alone is insufficient.

## Evidence baseline

Historical session checks: 38 backend tests passed after Gmail changes; TypeScript and backend build passed; Gmail authentication verified natively and inside Docker; four diagnostic email templates accepted by Gmail. Earlier frontend checks and a mock-AI browser journey through PDF download passed. Inbox receipt, real AI writing quality, paid billing, disaster recovery and production performance were not established by those checks.

Do not rerun the Mailpit-dependent browser journey against real Gmail. Use a dedicated test stack with isolated database, queues, asset storage, captured email and mock AI. Live SMTP/AI/payment checks require explicitly scoped accounts, recipients, budgets and safe test data.

## Step acceptance matrix

| Step | Positive scenario | Failure/concurrency scenario | Evidence required |
| --- | --- | --- | --- |
| S01 | API schedules work and its worker returns a retrievable result | Different environments cannot cross-consume; repeated request is one operation; foreign owner denied | Configuration/isolation test, operation API test and actual artifact retrieval |
| S02 | User saves, recovers a browser draft and restores a revision | Offline/refresh/quota error/two tabs/history race/stale suggestion preserve recovery choices | API concurrency results and browser recovery walkthrough |
| S03 | Approved outline produces durable sections and a coherent book | Worker crash, lost lease, dispatch gap, duplicate delivery and cancel settle credits correctly | Checkpoint fault tests, reconciled ledger and reviewed writing samples |
| S04 | Eligible code is delivered/accepted, verifies once and resets password | SMTP outage/retry, expiry, superseded resend, attempt limits and unknown account | Captured-mail tests, safe logs, queue expiry proof and separately scoped live SMTP check |
| S05 | User organizes, archives, duplicates and restores planning | Foreign assignment, pagination ties and outline changes cannot lose writing | API ownership tests and multi-book browser journey |
| S06 | Safe upload becomes a private reusable asset | Malformed/huge input, interrupted upload, foreign access and referenced deletion handled | Processing tests, storage/retrieval proof and upload UI journey |
| S07 | User creates/reopens/edits/exports a cover and inserts an illustration | Provider failure/cancel/repeat request does not destroy concepts or double-charge | Image job/ledger tests, cover artifact and typography review |
| S08 | Template application persists in digital and print preview | Missing glyph/font, long table, RTL/mixed text and stale design update handled | Language fixture review, reversible settings test and preview/export comparison |
| S09 | Known defects produce correctly anchored findings | Clean fixtures, edited/missing anchors and stale reports avoid misleading results | Curated report evaluation with detection limitations and browser navigation |
| S10 | PDF/EPUB/DOCX validate, download and open | Bad assets, corrupt file, unavailable storage and interrupted upload never report false readiness | Validator reports, file hashes/downloads and reader/editor opening record |
| S11 | Source import previews/applies and Q&A links real passages | Hostile archive/SSRF/prompt injection, unsupported scan and duplicate confirmation handled | Extraction/security tests, reversible import and passage-level source review |
| S12 | Verified purchase grants the correct entitlement/credits | Bad signature, duplicate/out-of-order event, refund and concurrent spend reconcile | Provider sandbox event records and independent ledger/entitlement assertions |
| S13 | Operator diagnoses a failure and restores a backup safely | Ordinary user denied, unsafe intervention rejected, alert failure surfaced | Permission tests, audit trail, alert receipt and isolated restore report |
| S14 | Destination package contains selected validated files/metadata | Missing files, stale input and foreign package access handled | ZIP manifest/checksums, rules version and manual publishing checklist review |
| S15 | Marketing variants persist, edit and download | Regeneration preserves user edits; stale inputs and invented claims are reviewed | Asset/history tests, reviewed outputs and actual downloads |
| S16 | Complete release journey succeeds in staging | Outages, rollback, scale, expired sessions and recovery remain controlled | Signed-off release record with all required gates and limitations |

## Shared functional requirements

- [ ] Every persisted resource and nested download enforces ownership/roles.
- [ ] Every visible action works or is explicitly unavailable; no placeholder success messages.
- [ ] Validation and loading/error/permission states have meaningful user actions.
- [ ] Paid operations show estimates and charge/refund according to one documented policy.
- [ ] Repeated clicks, retries and uncertain responses do not create duplicate effects.
- [ ] Concurrent edits return conflicts without losing recoverable data.
- [ ] Session expiry and reauthentication preserve safe recovery choices.
- [ ] Polling is bounded, resumes after reconnect and stops for terminal states.
- [ ] Private cached data and local drafts cannot cross accounts.
- [ ] Auth responses/logging do not expose credentials, OTPs or unnecessary account-existence information.

## Artifact and content review

Use small, medium and long books containing headings, lists, quotes, tables, links, images/captions, front/back matter and source citations. Include empty/incomplete content and corrupted assets intentionally.

- [ ] PDF page layout, font rendering, TOC/link targets, image resolution and selected print settings reviewed.
- [ ] EPUB conformance report has no unresolved blocking errors; navigation, metadata, cover, links and reading order checked.
- [ ] EPUB accessibility checked separately from structural validation; document remaining limitations.
- [ ] DOCX opens with editable styles, headings/tables/images/links and documented TOC behavior.
- [ ] Cover output uses correct dimensions and reproduces saved editable overlays.
- [ ] Distribution ZIP contains safe paths, expected file versions and the full reviewed manifest.
- [ ] Marketing/sample-chapter downloads open and match their stated source version.
- [ ] Files remain retrievable after a worker/container restart and from the deployed API, not only from a worker's local disk.

AI review uses a curated brief/outline set and human assessment of usefulness, factual support, originality concerns, repetition, voice, continuity, examples and target length. Record model/configuration, prompt version, token usage/cost and reviewer observations. Mock outputs establish orchestration behavior only. Quality scores and similarity checks must not be presented as accuracy/originality certificates.

## Language and accessibility matrix

| Fixture | Verify in editor and preview | Verify in each export |
| --- | --- | --- |
| English/Latin | Headings, punctuation, links, search/replace | Font embedding, line breaks and navigation |
| Bengali | Conjuncts, vowel signs, cursor/selection, mixed English terms | Glyph shaping, wrapping, selectable text and title/cover layout |
| Arabic RTL | Logical reading order, lists/tables, mixed numbers/Latin terms | Direction metadata, shaping, navigation and paragraphs |
| Representative CJK | Input, wrapping, counts and long headings | Font coverage, line breaking and overflow |
| Mixed/long content | Images, captions, long tables and narrow screens | No clipping, missing assets or broken structural references |

- [ ] Keyboard users can reach and operate all controls, including reorder and design positioning.
- [ ] Dialogs trap/restore focus correctly; labels and error descriptions are meaningful.
- [ ] Save/generation/validation changes have appropriate announcements without excessive noise.
- [ ] Contrast, zoom, touch targets, responsive layout and reduced motion pass review.
- [ ] Supported manuscript languages and UI translation scope are stated accurately.

## Reliability, security and operational checks

- [ ] Prove queue namespaces and worker/database/storage compatibility across local, test, staging and production.
- [ ] Kill workers at dispatch, provider response, checkpoint, charge and upload boundaries; reconcile resulting state.
- [ ] Confirm lease fencing prevents a stale worker from committing.
- [ ] Test unavailable Redis/database/storage/SMTP/provider services and subsequent recovery.
- [ ] Review auth/origin/CSRF controls, request sizes, rate limits, upload parsing, source SSRF and privileged endpoints.
- [ ] Verify payment signature handling and provider reconciliation without relying on browser success pages.
- [ ] Verify encryption keys, token-payload expiration, secret redaction and data/backup retention rules.
- [ ] Restore database and assets into an isolated environment and open recovered books/files.
- [ ] Demonstrate alert delivery and operator runbooks without automatic unauthorized external messaging.
- [ ] Load-test measured book sizes/concurrency and record response time, editor responsiveness, memory, queue age and cost budgets.
- [ ] Document rollback/forward repair for migrations and compatibility during staggered worker deployment.

Recovery targets, performance budgets, supported file sizes and production concurrency must be explicitly approved before their tests are considered passing. Do not invent a universal SLA from local development results.

## Test and release execution

Existing commands:

```sh
pnpm typecheck
pnpm --filter frontend lint
pnpm --filter backend test
pnpm --filter backend build
pnpm --filter frontend build
pnpm e2e
```

Use targeted checks while implementing a step and the full regression suite at release boundaries. Browser tests must verify actual API results, downloaded files and credit changes. Wait for concrete saved/job states; manuscript text containing “Saved” is not a valid save assertion.

A future Playwright suite may replace/extend Puppeteer only after equivalent assertions pass. Keep the old working journey until coverage migration is demonstrated.

## Final release gate

- [ ] S01–S15 gates complete with evidence for the advertised scope.
- [ ] Zero unresolved critical data-loss, ownership, payment-accounting or invalid-export defects.
- [ ] Important residual issues have an owner, customer impact and explicit release decision.
- [ ] Actual release artifact, commit, configuration and migration versions recorded.
- [ ] Staging registration-to-package/marketing journey passed with approved live-provider checks separately recorded.
- [ ] Production backups, restore/rollback procedure, readiness and alert destinations verified.
- [ ] Published feature/language/format claims match implemented and tested capabilities.
- [ ] Release decision and follow-up monitoring owner recorded.

## Evidence record template

```text
Step / requirement:
Status: not run | passed | failed | blocked
Commit / build / migration version:
Environment and relevant non-secret configuration:
Dataset / book size / languages / provider mode:
Commands and test identifiers:
Expected result and observed result:
Artifact / validator / audit / screenshot references:
Cost and performance measurements where relevant:
Remaining limitations / defect link / responsible owner:
Review date and release decision:
```

Do not fill this record with assumed passes. Store secrets, authentication tokens, customer manuscripts and live payment data outside shared evidence documents.

## S01 implementation evidence — 20 November 2026

Status: foundation gate passed; S02–S16 remain planned. Source changes are not a production rollout claim.

Implemented: shared operation/error/pagination schemas; durable owner/request/input identity; book/outline/writing/export submission replay and support references; durable queue dispatch retry records; namespace/configuration-specific BullMQ prefixes; worker capabilities with expiring heartbeats; cross-process private storage probes; bounded readiness; recent-activity UI; browser request-key recovery and account-change cache cleanup.

Verification:

- 48 backend tests passed, including real queue isolation, concurrent request replay, owner/deleted-book checks, changed-input rejection, uncertain submissions, broker-failure retry, unreadable worker probes and actual validated PDF download.
- Workspace TypeScript and frontend lint passed; backend and frontend production builds passed.
- Expanded browser journey passed against the production frontend with an isolated test-database/Mailpit/mock-AI API and worker: signup/OTP, wizard/outline, writing, idempotency headers, recent activity/support-reference action, autosave/history restore, AI suggestions, PDF download, credits and mobile dashboard.
- Isolated and native runtime readiness returned database/Redis/workers/storage all healthy.
- Additive migration `20261120130000_operation_foundation` applied to the isolated test and development databases.
- Existing Gmail configuration was preserved; browser test mail was captured in Mailpit and no paid AI requests were used.

Limits and rollout: domain job creation/reservation/outbox transaction gaps, orphan-credit reconciliation, exclusive processing/fencing and durable section checkpoints are S03 work. Uncertain requests are held for inspection rather than re-executed. Old unprefixed queues require an explicit drain/reconciliation cutover. Docker configuration/source is updated, but these checks do not constitute a new full Docker/production deployment. See [runtime runbook](../backend/RUNTIME.md).

Browser harness note: the temporary development-server proxy did not activate signup validation; using the release frontend with the same isolated API/worker passed the complete suite. No change to the signup form was needed.

## S02 and initial marketplace checks — 20 November 2026

Status: implemented and verified for the scenarios below; S02's complete resilience gate and S14's package gate remain open. No production deployment or marketplace approval is implied.

Implemented:

- Bounded structured-document grammar, supported nodes/marks/attributes, safe link protocols, depth and node limits before rendering or persistence.
- Serialized autosaves, explicit Save/keyboard shortcut, paused errors/conflicts, offline state and reconnection, retained failed edits, per-instance IndexedDB journal scoped by owner/chapter/base version.
- Explicit recovery review, conditional removal of recovered records, manual JSON backup, browser-close and clicked-navigation protection, storage-failure warnings.
- AI suggestions rejected if the document changed; cancelled suggestion responses cannot populate a newer request; oversized selections are rejected rather than silently truncated.
- Owner-protected publishing-check API and UI for KDP eBooks, Etsy, Gumroad and direct sales, versioned rules, official sources, JSON checklist download, and removal of the unverified print-ready label.

Verification:

- 53 backend tests passed: prior regressions plus bounded-document rejection/acceptance and marketplace language, format, file-size and review rules. API tests cover publishing report ownership and invalid destinations.
- Workspace TypeScript, frontend lint, backend build and frontend release build passed.
- Expanded Puppeteer browser journey passed against release frontend and isolated mock-AI/Mailpit API/worker: original signup-to-PDF journey, failed-save pause, draft persistence across reload, explicit recovery/manual save, concurrent server edit/OCC conflict pause and keep-mine, offline reconnect save, unavailable IndexedDB warning with successful server saving, marketplace destination selection and refreshed file checks after export. PDF response downloaded successfully (293184 bytes in this run).
- No paid AI requests or Gmail test delivery in this iteration. Screenshot collection disabled for this browser run.

Limits requiring further evidence/work:

- Concurrent server-edit test reproduces OCC through a second HTTP write; a full two-browser-tab editing/account-switch/logout matrix is still needed. Browser storage is local plaintext, isolated by application owner keys, not encryption against people with access to the browser profile.
- Failed IndexedDB access was simulated; actual disk-full/write-quota exhaustion, abrupt OS crash and termination during in-flight saves require additional failure tests. The final uncommitted keystroke cannot be guaranteed durable before IndexedDB commits. Existing recovery records are retained until explicit discard or successful recovery; retention controls remain pending.
- Navigation warning covers browser unload and clicked links/chapter buttons; programmatic routing/history can rely on the journal but does not yet have a universal navigation blocker.
- Backup download is JSON, not a completed import workflow. Stale AI guard is compiled and normal acceptance is browser-tested; a deliberately stale AI response race still needs its own browser fixture.
- Publishing checks inspect manuscript/export metadata, not live seller-account eligibility, file bytes or independent commercial rights. Current exports lack immutable snapshot identity and marketplace bundles. No eBook is automatically submitted or declared accepted.
- Frontend build initially failed under sandbox port restrictions; a permission-enabled retry repeated the diagnostic until the Turbopack cache was moved aside. A clean release build and subsequent warm build succeeded.

See [marketplace release track](./MARKETPLACE_RELEASE.md) for the prioritized remaining work. S03 transaction/checkpoint work remains the next dependency before commercial generation can be released.

## S03 generation recovery and S04 OTP delivery — 20 November 2026

Status: core implementations verified locally; production cutover and full release gates remain open. S05 is the next ordered implementation package.

S03 implemented:

- Transactional generation job, immutable input snapshot, credit reservation and outbox creation, with book-row serialization for starts and planning changes.
- Expiring worker leases, heartbeat and fenced writes; durable ordered sections and summaries; atomic manuscript revision/progress/charge commits; atomic terminal state/settlement.
- Matching-protocol lost-delivery reconciliation, cancellation checks before commits, preserved completed chapters, and reservation invariant checks.
- Read-only generation audit, sanitized job responses, saved-section/recovery UI and explicit behavior for new runs after cancellation/failure.

S04 implemented:

- AES-256-GCM encrypted, short-lived OTP outbox tied to actual verification IDs; atomic dispatcher claims and SMTP-runtime isolation.
- Bounded transient retries, permanent-failure handling, pre-send expiration/supersession/consumption/attempt checks, payload erasure and 14-day terminal metadata cleanup.
- Neutral UI wording, unchanged neutral Better Auth account responses, read-only email status counts, preserved direct SMTP diagnostic.

Verification:

- Full backend suite: **65 tests passed across 8 files**. Seven new generation recovery tests include concurrent starts, section reuse after lease loss, immutable inputs, a real child worker terminated with **SIGKILL** after a section commit, stale provider response fencing, transactional settlement rollback, lost Redis delivery reconciliation, and cancellation before a provider result commits (some tests cover multiple scenarios).
- Five new OTP delivery tests cover encryption, retry/acceptance/erasure, expired/consumed/attempt-exhausted/superseded codes, concurrent claims, permanent failures, tampering, retry limits, and successful verification using the actual Better Auth hash and expiry representation.
- Workspace type checking, frontend lint, backend build and frontend release build passed. `git diff --check` passed.
- Full Puppeteer browser workflow passed against the release frontend with an isolated mock-AI API/worker and **actual Mailpit SMTP delivery through the encrypted outbox**. Coverage retains signup/OTP, outline approval, generation, editor/history/AI acceptance, failed-save reload recovery, conflict handling, offline reconnect, unavailable IndexedDB, destination checks, valid PDF download (293184 bytes), credits and mobile dashboard. Screenshots disabled.
- Additive migrations `20261120143000_generation_checkpoints` and `20261120150000_email_delivery` applied to local test and development databases.
- Read-only local development generation audit returned no wallet mismatches and no jobs requiring review.
- No paid AI calls, Gmail diagnostic sends, marketplace submissions or production deployment performed in this iteration.

Remaining boundaries:

- Real process termination was tested at a section boundary, not every possible provider/network/commit boundary under production load. Provider billing can repeat when an external response is lost before durable checkpointing; customer chapter commits and settlement are fenced.
- Interrupted running jobs resume their saved sections automatically. Explicit retries after terminal failure/cancellation start a new job for unfinished chapters; cross-job partial-section reuse is not implemented.
- HTTP operation replay can still require operator review after a crash between domain commit and replay-response persistence. Historical ledger repairs are audited, not guessed automatically.
- Protocol 2 requires a deliberate drain/cutover from protocol 1. Existing Docker images were not rebuilt or deployed. See [RUNTIME.md](../backend/RUNTIME.md).
- SMTP cannot be atomically committed with PostgreSQL. A delivery may duplicate after acceptance followed by a process failure. Supersession during SMTP keeps the old code invalid, but cannot retract an already accepted message. The verification-to-outbox callback boundary still relies on a fresh resend after a process failure. Secret/configuration rotation invalidates pending dispatcher identity; see [EMAIL.md](../backend/EMAIL.md).
- Live Gmail inbox receipt, production alert delivery, operator permissions, restoration, payment/provider reconciliation, load/security/accessibility review and marketplace file validators remain separate release gates.

## S05 library and planning — 20 November 2026

Status: core library/planning gate passed locally. S06 private assets is next. This is not a production deployment or completion of later roadmap packages.

Implemented:

- `/app/projects`: create/edit descriptions and names, search, pagination, archive/restore, and project-to-library navigation. Project deletion unassigns its books instead of deleting them.
- Library filters for project/unassigned, language, type, status and archive state; newest/oldest/title ordering with ID tie-breakers, bounded cursor pagination, and filter/page state in the URL.
- Owner-checked project assignment/reassignment; book archive/restore distinct from soft deletion; explicit brief/outline-only or manuscript duplication. Copies have new identities and no credit spend, jobs, exports or copied revision history.
- Optional brief purpose, reader age, writing style, point of view, brand and terminology, with defaults and actual prompt integration. Progressive-disclosure form fields and account/tab-session-scoped IndexedDB recovery for unfinished briefs, independent of manuscript recovery.
- Outline version list/detail/preview and restore as a new unapproved plan. HTTP saves require `baseVersion`; approval requires the reviewed `version`. Stale saves/approvals/restores reject with conflict. Repeated approval of the same version preserves materialized chapter IDs.
- Restoring planning does not change manuscript chapters, order, text, history or book metadata. Structural approval/editing is blocked once manuscript edits exist; duplication provides a separate planning path.

Verification:

- **72 backend tests across 9 files passed**, including seven new library/planning tests: owner isolation, archived-project assignment rejection, metadata preservation, archive/deletion distinction, tied-timestamp pagination, bounded filters, independent manuscript duplication without credit spend, stale/missing version tokens, harmless repeated approval, written-manuscript preservation, busy-book rejection and deleted-book isolation.
- Workspace type checks, frontend lint, both builds, and `git diff --check` passed.
- Expanded Puppeteer journey passed with the release frontend, isolated test database, mock AI and Mailpit. It verifies wizard recovery after reload; original signup-to-PDF and edit-recovery flows; history restoration after writing with identical chapter metadata; project create/edit; assignment; URL filtering; book archive/restore; manuscript duplication; credits and mobile dashboard. PDF download validated (293184 bytes in this run). Screenshots disabled.
- Initial browser run found the wizard could be clicked while its recovery check was still loading. Explicit disabled submit controls and visible recovery-loading state fixed this; the complete rerun passed.
- Additive migration `20261120160000_library_archive` applied to test and local development databases. Release APIs and frontend must be updated together because outline write/approval version tokens are now required.

Boundaries:

- Archive is library organization, not deletion or a document access revocation. Book archive/duplication is rejected during active generation; archived books remain accessible to their owner by direct URL. Project archive does not cascade to books.
- Pagination is deterministic across ties, not a historical snapshot of a changing library. A removed/filtered cursor requires restarting at the first page; UI retry resets that cursor.
- Project lists paginate; assignment/filter dropdowns currently show up to 100 matching projects. A searchable assignment picker for accounts beyond that size remains a UX extension.
- Planning recovery is local to the account and tab session, not cross-device sync. Closing the tab can lose its recovery key; a browser that clones session storage when duplicating a tab can share that key. Storage failure is reported; there is no guarantee against loss before an IndexedDB commit. Planning-draft retention controls and additional browser-failure tests remain future hardening work.
- The current outline format has flat section topics. Nested sections, stable cross-version section mapping and destructive structural reconciliation of written books remain unsupported; current safeguards preserve the manuscript instead of guessing mappings.
- Optional author-brand fields are per brief; reusable account-level brand presets are not implemented. Asset/design copying is deferred until those models exist.
- No new Gmail sends, paid AI requests, remote push, Docker rollout or production deployment in this iteration. Full release gates in S16 remain open.

## S06 private images — 20 November 2026

Core private asset pipeline implemented. This is local verification, not a production rollout or marketplace certification.

- Asset metadata includes ownership, sanitized media hash/dimensions/bytes, upload provenance, alt text/caption, lifecycle state and book reference pins. Original uploads are never persisted; only decoded, orientation-corrected, metadata-stripped WebP becomes ready.
- PNG/JPEG/WebP signatures and declared MIME must match. Limits: 10 MiB input/output, 24 MP, 10,000 pixels per side, two active decoders per API, 20-second decoder timeout; animated images and active formats are rejected. Chapters cap image occurrences at 100; PDF image budget is 50 MiB counting repeats.
- Owner-authenticated streaming, no-store browser responses, server-selected private storage keys, paginated account library, upload progress/errors, alt/caption editing, explicit deletion confirmation, and an editor picker are implemented. Images persist as asset IDs with per-occurrence alt/caption, never arbitrary remote URLs.
- Save/delete share transactional asset locks. Saved images remain pinned through revision history, chapter removal, book soft deletion and manuscript duplication. This deliberately favors preservation over automatic garbage collection. Unsaved browser drafts are not pinned and the deletion warning explains this.
- PDF rendering embeds authorized image bytes and rejects unavailable or broken images; it cannot fetch user-provided image URLs. Image-only chapters are written content and included in exports. Immutable full export snapshots remain S10 work.
- Worker cleanup retries physical deletion and removes interrupted uploads after one hour; ready library uploads are not automatically expired. Readiness already checks API/worker storage compatibility. Runtime protocol 3 prevents old workers from silently dropping images; drain protocol-2 work before deployment.

Verification: 78 backend tests across 10 files passed, including six asset tests for owner isolation, metadata stripping/orientation, malformed/MIME-spoofed/truncated/oversized/high-pixel inputs, protected history/copies/deleted books, failed-write cleanup, deletion retry, and save/delete races. Type checks, frontend lint and both builds passed. Expanded Puppeteer journey passed using release frontend, isolated test database, mock AI and Mailpit: upload via file input, metadata save, insert, autosave, reload with decoded private image, disabled referenced deletion, and valid illustrated PDF download (305186 bytes). Existing editor recovery, generation, library, OTP and mobile flows also passed. Animation, image-only chapter and repeated-image budget refinements are covered by the final regression pass recorded below.

Remaining release evidence: production S3/MinIO permissions and failure testing, sustained resource/load tests, distributed/account upload quotas, native decoder operational hardening, and crash testing every storage boundary. Reference pins are conservative lifetime retention; there is no historical-reference purge UI. Physical cleanup after manual database/storage changes and restore reconciliation belong to S13. S07 AI image generation and editable cover typography is next; later roadmap packages remain incomplete.

Final regression: the complete 78-test suite passed after the animation, image-only chapter and image-occurrence limits. A targeted asset rerun passed with the explicit repeated-byte budget assertion; asset plus library suites (13 tests) passed after ensuring manuscript duplication locks all referenced assets in consistent global order. Final type checks, lint and release builds passed. The additive asset migration was applied to local development and test databases. Temporary browser services were stopped; no Gmail deliveries, paid AI calls, production deployment or remote push were performed.

## S07 cover and illustration studio — 20 November 2026

Core S07 implementation is available at **My eBooks → a book → Cover**. This is local implementation/verification, not a production rollout or a promise of marketplace acceptance.

Implemented:

- OpenAI image adapter with configured supported model, fixed medium quality, bounded aspect/size, no client-supplied provider parameters, timeout and disabled automatic provider retries. Default price is 20 application credits per saved image, displayed before generation and verified by the server. Mock mode is explicitly labeled.
- Reuses `GenerationJob` for image jobs instead of a parallel job/reservation system: immutable title/prompt/visual-direction/model inputs, atomic credit reservation and outbox, request replay, queue isolation, leases/heartbeats/fencing, completed artwork checkpoint recovery, exactly-once customer settlement and protected concept history. Queued cancellation refunds immediately; running cancellation fences the result and releases credits after completion/timeout/recovery. Failed regeneration preserves previous concepts and selected artwork.
- Cover concept and interior illustration modes; portrait/square/landscape controls; saved style, palette, character notes and visual direction applied to subsequent requests. Generated images enter the private library and can be inserted into chapters using S06 controls. Prompt-based visual consistency is not guaranteed.
- Artwork selection/upload is separate from title/subtitle/author. Three editable text layers support fonts, weights, colors, alignment, direction, size and normalized bounding boxes. Pointer dragging, arrow keys and numeric alternatives, safe bounds, dark overlay and contrast feedback are provided. Preview includes crop behavior and non-exported selection guides.
- Immutable cover versions and OCC; stale saves reject without overwriting. UI can retain its draft while loading latest saved text for review, or discard and load the saved design. Bounded undo/redo, account/book/tab-session draft recovery, navigation warnings, storage-failure messages and downloadable JSON draft backup protect editing. Browser drafts are not encrypted or cross-device synced; backup JSON import is not yet provided.
- Owner-only high-resolution JPG download of the selected saved version. Shared composition coordinates and vendored Noto Sans, Bengali, Arabic and Devanagari fonts are used in preview and export, with bundled OFL notices. Renderer embeds private artwork/fonts, blocks external network requests, checks overflow and validates JPEG dimensions. Text changes do not invoke generation or spend credits.

Evidence:

- Complete backend regression initially passed 87 tests across 11 files; additional stale-image-worker fencing coverage was added for the final pass. Cover tests verify ownership, stale versions, immutable history, artwork retention, duplicate request replay, credit reservation/settlement, insufficient funds, changed pricing, provider-parameter rejection, queued/running cancellation, provider timeout preservation, checkpoint resumption, escaped overlays, deterministic repeat renders, four language/script fixtures and explicit text-overflow failures.
- Workspace type checks, frontend lint and both release builds passed before the browser run. The expanded Puppeteer journey passed using the release frontend, isolated test database, mock AI and Mailpit: generate a concept, select artwork, save, edit Bengali title without spending credits, undo/redo, reload/recover a draft, reopen the saved design, download an actual 1600 × 2560 JPG, and generate an interior illustration. The exported Bengali JPEG was visually inspected. All earlier signup-to-PDF, private-image, manuscript recovery, library, credits and mobile-dashboard flows also passed.
- Final conflict-review browser coverage and final regression results are recorded below after completion.

Release boundaries:

- No paid OpenAI request was made; model access, real provider quality/latency and billing still require a controlled deployment canary. Provider success before durable storage can be billed again after a crash even though customer settlement remains fenced.
- Saved compositions and source assets are retained; generated JPGs are rendered on demand rather than stored as immutable release-package artifacts. Cover attachment to ebook exports, full export snapshots and packaging remain S10/S14 work.
- Digital front covers only. No spine/back wrap, bleed calculator or print-ready claim. Artwork is cropped/upscaled to the composition; resolution alone does not guarantee sellable artwork quality.
- Tested font families cover the named fixtures, not all application languages. Other scripts, complex mixed-script layouts and production screenshot comparison require S08 validation. No claim of universal multilingual typography is made.
- Image/cover concurrency caps apply per process; distributed quotas, production S3/failure testing, sustained load tests and database/storage restore reconciliation remain release work. Conservative concept/cover pins have no purge UI.
- The existing operation crash gap can still require operator review if a domain submission commits before its HTTP replay result is saved. The S01 behavior is retained; ambiguous operations are not silently resubmitted.
- Migration `20261120180000_cover_studio` and runtime protocol 4 require a coordinated drain and API/worker/frontend cutover. See `backend/RUNTIME.md`. No remote push or production deployment is implied.

Final S07 verification:

- **88 backend tests across 11 files passed**, including the added expired-lease/late-provider-result case. After checking the current OpenAI model lifecycle, the retired `gpt-image-1` was removed, default changed to `gpt-image-2.6-sunburst`, and the cover/runtime suites were rerun: **20 tests passed**. The allowlist also permits `gpt-image-2.6-flare` and `gpt-image-1.5`; snapshot validation uses the same server schema.
- The final full Puppeteer journey passed again with the added cover conflict fixture: a simulated second tab saves version 4, the stale version-3 edit receives a conflict, the local draft survives, latest saved text is shown for review, and explicit Save creates version 5. Existing cover, illustration, manuscript, PDF, OTP, library and mobile checks continued to pass.
- Final type checks, frontend lint, both release builds and `git diff --check` passed. Migration `20261120180000_cover_studio` was applied to local development and test databases. The bundled fonts have SHA-256 hashes and retained OFL notices.
- No paid provider call, Gmail delivery, remote Git push or production deployment was performed. Temporary test services were stopped. S08 interior templates and multilingual reader previews is next; the product-wide production gates remain open.

## S08 interior design and multilingual previews — 20 November 2026

Core S08 is available at **My eBooks → a book → Design**. This is local implementation and verification, not a production rollout. A print-layout PDF is not a print-ready or marketplace-approved file.

Implemented:

- Immutable `BookDesign` versions (`save`, `template`, `restore`) with OCC. Stale saves, template applications and restores return 409 with the latest version. Books without a design get version-0 defaults that reproduce the earlier export layout (6 × 9 in, serif, spaced paragraphs). Restoring copies an old snapshot into a new version, so a restore can itself be undone.
- Four versioned templates (Standard, Classic, Modern, Workbook) are defined in `packages/shared`. Applying one stores a full settings snapshot and `{id, version}`, and front/back matter is never changed. Hand edits to template-controlled settings clear the template label. Deviation: templates are code-defined versions instead of a `TemplateVersion` table, because they ship with the application and need no runtime editing.
- Separate profiles: shared typography/elements; reflowable defaults (text scale, line width); and print (seven trim sizes, margins with a minimum text block of 2.5 × 4 in, mirrored margins, running heads, page-number placement). Structured matter covers the title page, copyright, dedication, contents heading, and About the author and References (back matter, listed in the contents). Included sections require text.
- One normalized book document and one renderer serve both reader and print modes. Reader mode emits no `@page`, page counters, running heads, trim or margins. PDF export and print previews use print mode. Exports freeze the design snapshot and version at request time, so later edits never change a queued export. The export list omits snapshots. Print previews render a real PDF of the front matter plus three chapters through the export path, from a saved version or an unsaved draft, without persisting anything.
- Fonts: 38 pinned OFL-1.1 files with SHA-256 hashes, sources and licence files in `backend/assets/fonts/manifest.json`. Interior text uses **static** TrueType faces. Static non-CJK faces are vendored (7.05 MB). CJK faces (44.8 MB) are installed by `fonts:fetch`, which the Docker build runs. Exporting no longer contacts Google Fonts. Renderer network access is blocked and fonts are served from verified bytes. A font load error fails the render. Servers missing a language's fonts report it as `unavailable` and return 409 for exports and print previews.
- Multilingual handling: each script has its own serif/sans family, followed by Latin and then the other bundled scripts for mixed-script text. Text is NFC-normalized at render (stored manuscript is unchanged). The book language sets `lang`/`dir`. Mirrored margins and outside page numbers follow Chromium's left/right page assignment, including right-to-left page progression. CJK uses strict line breaking (Korean keeps words together). Urdu Nastaliq gets a minimum line height of 2.0. Bold is never synthesized; italic is slanted for scripts without italic faces. Long tables repeat a leading header row on each page and wrap long cells. Table cell spans now render.
- Diagnostics: cmap-based detection of characters no approved font covers (reader preview, exports); post-render detection of non-bundled embedded fonts, Type 3 fonts and content wider than the text block. Results are stored on each export and shown in the export history.
- UI: template gallery with preview-before-apply, affected-settings diff and one-click undo; settings with keyboard-operable tabs and inline validation; matter editor marking optional and required fields; history with preview and restore; tab-session draft recovery, navigation warning and conflict choices (keep draft / load saved). The reader preview is a script-less sandboxed iframe with phone, tablet and desktop widths (scaled to fit, never clipped) and a reader text-size control that is not saved. The print sample shows page count and font/overflow findings and explains how a browser preview differs from the generated file.

Evidence:

- Probes on Chromium 157 showed: `break-before: right` does not insert blank pages; variable TrueType, CFF/OTF and synthesized-bold text embed as **Type 3** fonts; static TrueType embeds as CID TrueType. The font supply was switched to static faces as a result. The first variable-font build passed a font check vacuously because Type 3 fonts carry no `BaseFont`. The detector now reads `FontDescriptor/FontName` and also asserts that no Type 3 fonts are present.
- **105 backend tests across 12 files passed** (88 before S08). New PDF fixtures cover English with embedded Arabic and Bengali, Bengali conjuncts and nukta forms, Arabic RTL with Latin and digits, Urdu, Hindi, Tamil, Chinese, Japanese and Korean. Each must produce a valid PDF with bundled fonts only, no Type 3 fonts, no overflow and the expected family embedded. Other fixtures cover a 90-row table with long URLs (repeated header, ≥ 7 pages, no overflow), Thai reported as uncovered, and exact trim size. Ten design API tests cover defaults, owner isolation, OCC/history immutability, reversible templates that preserve matter, rejection of invalid trims, margins, colours, unknown fields and empty required sections, reader/print separation and HTML/CSS escaping, a real print sample at the saved trim, the font route allowlist, capabilities, an export rendering the request-time design after a later edit, and 409 for a language with missing fonts.
- Visual review of rendered Bengali, Arabic (Classic template) and Japanese chapter pages: correct conjunct shaping, RTL layout with outside folios and running head, kinsoku line breaking, and mixed Latin text. `pdffonts` reported CID TrueType for every face.
- The expanded Puppeteer journey passed against the release frontend with an isolated database (`ebook_studio_e2e`), Redis db 2, mock AI and Mailpit. It previews Classic without persisting, applies it, undoes it and reapplies it; blocks saving an empty required dedication; saves Bengali dedication text and confirms it after reload; checks for no print-only CSS in the reader, localized chapter labels, the bundled Bengali font loaded, and the tablet width and reader scale; renders a print sample (clean 5.5 × 8.5 in PDF); resolves a second-tab conflict while keeping the draft; and exports with "design v6" and clean diagnostics. All earlier flows passed in the same run. One earlier run failed once after OTP verification (redirect to login despite a successful verify); the rerun passed. This intermittent S04-area behaviour needs follow-up.
- Screenshots of the reader preview (desktop and mobile), print sample and export history were reviewed. Clipped tablet frames and an oversized reader title at phone width were found and fixed before the final run.
- Workspace type checks, frontend lint, both release builds, `fonts:verify` and `git diff --check` passed. Migration `20261120190000_book_design` was applied to the local development, test and e2e databases.

Release boundaries:

- Not print-ready: there is no bleed, cover wrap, spine or printer preflight, and PDF/X and PDF/A are not produced. Chapters start on the next page, not the next right-hand page. The printed contents has links but no page numbers. Front-matter pages are unnumbered, not Roman-numbered. Running heads show book title/author, not chapter titles.
- Facing-page spreads are not previewed. Browser PDF viewers show single pages, and headless test browsers show no PDF viewer (bytes were verified instead).
- Paragraph direction follows the book language. Per-paragraph direction overrides are not editable, so an opposite-direction paragraph relies on the Unicode bidi algorithm. Hyphenation depends on the renderer's dictionaries.
- The editor screen still loads Google Fonts for editing. Only previews and exports use the bundled fonts.
- Scripts outside the bundled families, including emoji, are flagged as missing glyphs and may render with system fonts in Docker. CJK serif is not bundled, so CJK uses sans for both settings.
- EPUB/DOCX adapters, immutable manuscript snapshots and validators belong to S10. Production Docker builds must fetch CJK fonts over the network at build time. Protocol 5 requires a coordinated drain and cutover (see RUNTIME.md).
- No Gmail delivery, paid AI call, remote push or production deployment was performed. S09 quality reports is next.
