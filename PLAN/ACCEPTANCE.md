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
| S11 | Source import previews/applies and Q&A links real passages | Hostile file/prompt injection, unsupported scan and duplicate confirmation handled | Extraction/security tests, idempotent import and passage-level source review |
| S12 | Verified purchase grants the correct entitlement/credits | Bad signature, duplicate/out-of-order event, refund and concurrent spend reconcile | Local provider event records and independent ledger/entitlement assertions; a live processor is not connected |
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
- PDF rendering embeds authorized image bytes and rejects unavailable or broken images; it cannot fetch user-provided image URLs. Image-only chapters are written content and included in exports. Immutable full export snapshots are implemented in S10.
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
- Saved compositions and source assets are retained; generated JPGs are rendered on demand rather than stored as immutable release-package artifacts. Cover attachment to ebook exports, release packaging and full distribution bundles remain S14 work. S10 records each export's asset snapshot, so the cover included in an export is identified by asset id and hash.
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
- EPUB/DOCX adapters, immutable manuscript snapshots and validators are implemented in S10 and recorded in the iteration below. Production Docker builds must fetch CJK fonts over the network at build time. Protocol 5 requires a coordinated drain and cutover (see RUNTIME.md).
- No Gmail delivery, paid AI call, remote push or production deployment was performed. S09 quality reports was completed in the iteration recorded below.

## S09 quality review — 20 November 2026

Status: core implementation complete and verified locally. This is not a production rollout, a marketplace certification, or a claim of factual accuracy. S10 is recorded in the iteration below.

Implemented:

- Versioned `book_contexts` carry voice notes, terminology with variants to avoid, agreed definitions and per-chapter summaries. New fields default to empty so contexts stored before this iteration still load.
- Deterministic checks cover empty and short content, heading hierarchy, repeated passages, broken assets and links, metadata, missing alt text, script mismatch, unsupported glyphs, terminology variants, cross-chapter numeric contradictions, competing definitions and out-of-date chapter summaries.
- Cross-chapter contradiction detection compares the same subject measured in the same unit across different chapters and reports the later claim against the earlier one. Same-chapter pairs and different units are not compared, so ordinary prose variation is not flagged.
- Definition conflicts fire only when a chapter states a competing definition for a term the book context defines, and only when the two meanings share no significant content. Summary gaps fire only when most content words of an author-written summary are absent from the chapter.
- The costed AI review returns clarity, repetition, consistency, contradiction and evidence findings. Definitions and chapter summaries are supplied to the review. Every quoted reference is verified against the chapter; unverifiable model references are discarded and counted in the report summary.
- Each finding points at a real text anchor. Findings that need human review are marked as such and state that eBookStudio does not verify facts or sources. No aggregate quality score is produced.
- The workspace is at My eBooks → a book → Quality. It shows the input version, the rules version, the checks that ran and the checks that did not, and the credit estimate before a costed review. Filters cover severity, category and chapter; opening a finding highlights the passage in the editor, and a suggested replacement is applied as an ordinary versioned edit.
- Stale reports, moved text and removed chapters are explained rather than highlighted as if current. Review and dismissal notes are kept with the finding and attributed to the reviewer.

Verification:

- **The full backend suite passed: 123 tests across 14 files** (`pnpm --filter backend test`, PostgreSQL 17 and Redis 7 in Docker). This includes the new database-backed test that stores definitions and chapter summaries, rejects a duplicate definition term and loads a context saved before the fields existed, plus the 8 database-free deterministic-check tests in `backend/tests/pure-quality-checks.test.ts`: conflicting numbers are found and anchored to the later claim and the anchor resolves against the real chapter text; a competing definition is found and anchored; the same book stays silent when the numbers agree and the definition matches; a drifted chapter summary is flagged; same-chapter pairs and different units are not compared; the measured subject is the noun before the number rather than the unit word; a context stored before definitions existed does not fail the run.
- **The Puppeteer journey passed end to end** (`pnpm e2e`, 22 screenshots). The S09 flow was extended to add a definition, seed a contradicting paragraph and assert a Contradictions finding: the report shows a "Contradictions · 1" category, the filter selects it, and the finding reads "This chapter defines “batch cooking” differently from your book context", anchored to the quoted passage. The journey also covers the free checks, the anchored finding, the editor highlight, resolving a finding, a terminology replacement applied as a normal saved edit, an attributed dismissal with a note, a stale report and the costed AI review.
- Workspace TypeScript, frontend lint, backend build, frontend release build and the e2e TypeScript check passed.
- Two environment repairs were needed before the suite could run and are recorded because they affect any fresh checkout: the Chrome build Puppeteer uses was missing from the local cache and was reinstalled with `pnpm --filter e2e exec puppeteer browsers install chrome`; the optional CJK font files and five pinned OFL licence files were fetched with `pnpm --filter backend fonts:fetch` and verified against the manifest SHA-256 (`pnpm --filter backend fonts:verify`, 38 files).
- Two pre-existing defects in the browser journey were fixed while extending it: the report panel renders a loader until its detail arrives, so selecting a finding filter could run before the filter existed; and the journey patched a chapter immediately after an editor autosave, which could overwrite the saved edit. The journey now waits for the filter and for the autosave to reach the server.

Remaining boundaries:

- Contradiction detection is deliberately narrow. It compares a shared subject noun and unit, so numbers whose subject is described differently across chapters are not compared, and it cannot prove a contradiction. It flags a likely conflict for the author to resolve.
- Definition and summary checks rely on the author's own context. A book with no definitions or summaries gets no contradiction, definition-conflict or summary-gap findings from these rules.
- No aggregate score, accuracy measure or originality certificate is produced. Findings that need human review say so; the review cannot verify facts, sources or claims.
- The AI review depends on provider output quality. It was exercised only in mock mode; no paid provider call, live latency or billing check was performed.
- The browser journey and the backend suite were run locally against a mocked AI provider, a local Mailpit and bundled fonts. They were not run against a deployed stack, a real provider or a real mail service.

## S10 validated PDF, EPUB and DOCX exports — 20 November 2026

Status: core implementation complete and verified locally. This is not a production rollout, a marketplace certification, or a print-ready claim. S11 is recorded in the iteration below.

Implemented:

- Export requests capture an immutable input snapshot before any work is enqueued. The snapshot records the book metadata, every chapter with its exact `document_versions` id, the design version, each asset id with its SHA-256, the requested format and its options, and a content hash of the captured inputs. A later manuscript, design or asset change cannot alter a queued or completed export; the export is rendered from the snapshot, not from current state.
- A renderer registry (`backend/src/services/exports/renderers.ts`) consumes the normalized book document. PDF keeps the existing S08 implementation and output; EPUB and DOCX are new renderers behind the same interface. Shared export contracts live in `packages/shared/src/exports.ts`.
- EPUB 3 output is a real package: `mimetype` (`application/epub+zip`), `META-INF/container.xml`, an `OEBPS/content.opf` package document, XHTML content documents, a CSS stylesheet, `nav.xhtml` with `epub:type="toc"` and `epub:type="landmarks"`, and image assets under `OEBPS/images/`. Language and writing direction are set from the book (`lang`, `dir`), and all text is XML-escaped.
- DOCX output is a real OOXML package: `[Content_Types].xml`, `_rels/.rels`, `docProps/core.xml` and `app.xml`, `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/_rels/document.xml.rels` and `word/media/`. Headings use `Heading1`, the table of contents is a `TOC` field that Word refreshes on demand, and the document states that it must be updated rather than promising a live-updating TOC.
- Validators re-open the stored file after writing and report pass/fail with per-validator issues. The PDF validator checks the header, page objects, fonts and trailer; the EPUB validator checks the mimetype, container, package manifest, navigation document and spine; the DOCX validator checks the required parts, styles and relationships. A file that fails validation is never marked ready.
- Each export stores the artifact bytes, the SHA-256 of the stored file, the correct `contentType`, the file size and a page count for fixed-layout outputs only, plus render diagnostics (missing glyphs, non-bundled fonts, Type 3 fonts, overflow) and the validation report. The server reads the artifact back from the same storage path used by downloads before it reports readiness.
- Routes: `GET /api/v1/exports/formats` describes the available formats and their options, `GET /api/v1/exports/:exportId` returns the immutable detail with the validation summary, and `GET /api/v1/exports/:exportId/download` streams the stored file with the recorded content type. All are owner-scoped.
- Migration `20261120210000_export_snapshots` adds the `snapshot`, `validation`, `sha256` and `contentType` columns and is additive; existing export rows stay readable and are shown as not yet checked rather than as validated.
- The export screen selects a format, shows only the options for that format, and lists export history with format, creation time, size, applicable page count, validation warnings and render findings. Download is offered only for ready exports that the server validated.

Verification:

- **The full backend suite passed: 150 tests across 17 files** (`pnpm --filter backend test`). The pure deterministic suite passed separately: 19 tests across 2 files (`vitest run --config vitest.pure.config.ts`).
- New export coverage: `backend/tests/exports.test.ts` (9 tests) proves the request-time snapshot is captured, a later design change cannot alter a queued export, a second export is refused while one is in progress, options belonging to another format are rejected, exports are isolated between owners, and a PDF, EPUB and DOCX are each produced, stored, re-read and validated, with an export whose stored file does not validate failing. `backend/tests/export-validators.test.ts` (7 tests) covers the three validators against valid and malformed input. `backend/tests/pure-export-checks.test.ts` (11 tests) covers the renderer and validator helpers without a database.
- **The Puppeteer journey passed end to end** (`pnpm e2e`, 26 screenshots) against an isolated stack: dedicated database `ebook_studio_e2e`, separate Redis namespace, separate storage root, mock AI and Mailpit. The S10 flow exports PDF (170206 bytes), then EPUB (8958 bytes) and DOCX (5342 bytes) from the same screen, waits for each validated state, downloads each file in the browser and asserts the HTTP status, the `PK` magic bytes and the `application/epub+zip` and WordprocessingML content types. The screenshots `13-export-epub.png` and `14-export-docx.png` were reviewed and show both cards as Ready with "Validated: the stored file was re-opened and checked by the epub validator" / "docx validator" and a Download action.
- **The stored artifacts were inspected directly.** The EPUB opens as a ZIP with 19 expected entries; its `mimetype` is `application/epub+zip`, `container.xml` points at `OEBPS/content.opf`, and `nav.xhtml` carries `epub:type="toc"` with all eight chapters. The DOCX opens as a ZIP with the nine expected parts; `document.xml` contains the title, subtitle, copyright page, the Bengali contents heading, a `TOC` field and the chapter body text, and `[Content_Types].xml` declares the WordprocessingML main document part. The PDF starts with `%PDF-1.4`, contains 20 page objects, embeds fonts (`/FontFile2`), and ends with a trailer and `%%EOF`.
- **The recorded SHA-256 matches the bytes on disk** for all four exports, and each stored snapshot contains the request-time format, options, chapter versions, asset hashes and design version.
- Shared, backend and frontend type checks passed; frontend lint passed; the frontend production build completed successfully, including TypeScript and static generation of all 25 routes. `git diff --check` passed.

Two defects were found and fixed while extending the browser journey:

- The journey selected the marketplace destination with `page.select('select', 'etsy')`. S10 added a PDF layout `<select>`, which is now the first select on the page, so the destination was never changed and the run failed at the export step. The destination select now carries `aria-label="Publishing destination"` and the journey targets that label. The label is also an accessibility improvement for screen readers.
- EPUB navigation detection scanned a 300-character window that could contain another manifest item, and DOCX validation rejected a `Heading1` style that the renderer does emit. Both were fixed in the renderers and validators.

Release boundaries:

- **Validation success is not marketplace approval.** The validators check that a file is structurally valid and readable by the corresponding format rules. They do not check Amazon KDP, Etsy or Gumroad requirements, and they do not certify that a listing will be accepted. The marketplace checklist remains a manual preparation aid, and the screen states that marketplace approval is never guaranteed.
- The EPUB was not opened in Kindle Previewer, Apple Books, Kobo or an online reader, and the DOCX was not opened in Microsoft Word or LibreOffice. The checks above are package- and content-level, not an application-level open. Representative-reader review is still outstanding.
- The DOCX table of contents is a Word field. It shows a placeholder until the reader refreshes the field, and the document says so. Page numbers appear only after that refresh.
- The EPUB has no EPUB 3 accessibility metadata, no `epub:switch` alternative renditions, and no media overlays. It is a valid EPUB 3 package, not an accessible EPUB.
- The PDF is not print-ready. There is no bleed, cover wrap, spine or printer preflight, and no PDF/X or PDF/A. Chapters start on the next page, not the next right-hand page, and the printed contents has links but no page numbers.
- The renderer registry has three formats. Additional formats are not implemented, and the frontend disables a format the server reports as unavailable.
- Page counts are recorded only for fixed-layout PDF output. EPUB and DOCX have no page count because their layout is decided by the reader.
- The validation reports were produced in the local environment with bundled fonts, mock AI and local storage. They were not run against a deployed stack, an S3-compatible object store or a production worker fleet.
- Migration `20261120210000_export_snapshots` is additive and was applied to the local E2E database. No remote push or production deployment was performed, and no paid provider call or real email delivery was made.

## S11 private source imports and source-grounded research — 21 November 2026

Status: core implementation complete and verified locally. This is not a production rollout, a marketplace certification, or a claim that an answer is factually correct. S12 is recorded in the iteration below.

Implemented:

- The shared contract lives in `packages/shared/src/sources.ts` and is exported through `packages/shared/src/index.ts`. It fixes the supported formats (`notes`, `docx`, `pdf`), the accepted MIME types per format, a 5 MiB upload limit, a 400,000-character extraction limit, a 4,000-character passage limit, a 2,000-passage limit and the extraction states `ready`, `empty`, `scanned` and `failed`.
- The schema adds `ResearchSource`, `SourceVersion` and `ChapterSourceLink`, applied by `backend/prisma/migrations/20261121090000_research_sources/migration.sql`. A source holds the private original file; a version holds one immutable extraction with its SHA-256, its warnings and its passages; a link ties a source to a chapter with the locators that support it.
- Extraction lives in `backend/src/services/sources/extractors.ts`. The declared type is checked against the file signature, so a binary file renamed to `.txt` and a non-PDF named `.pdf` are refused rather than stored. Empty, oversized, corrupt and unsupported files are refused or reported as `failed`. The notes reader keeps a heading together with its own text and records the heading on the passage. The DOCX reader reads only `word/document.xml`; macros, embedded objects and external references are never executed or followed. An image-only PDF is reported as `scanned`, because OCR is not implemented. Character and passage bounds are enforced and a truncated passage is flagged.
- Passage locators (`p1`, `p2`, …) are numbered across the whole document, so a locator always identifies exactly one passage. A section heading is kept with its own text, so a proposed chapter follows the document's own structure rather than a guess made from the text.
- `backend/src/services/sources/sourceService.ts` performs upload, extraction and version persistence, the preview, the transactional apply, chapter linking, deletion and the ownership checks. The preview returns the proposed chapter mapping, the passages and the extraction warnings, and it says whether the version was already applied. The apply is **idempotent**: the version is claimed by setting `appliedAt` inside the transaction, so a repeated confirmation returns the same result and never creates a second copy of the same chapters.
- `backend/src/services/sources/researchService.ts`, `backend/src/services/sources/retrieval.ts` and `backend/src/services/ai/sourceAnswerer.ts` answer questions and write summaries from retrieved passages only. An answer whose citation names a passage that does not exist, or that cites nothing at all, becomes an explicit abstention rather than an answer. Passage text is quoted to the model as evidence and the prompt states that instructions inside a passage are not commands.
- `backend/src/routes/sources.ts` is registered in `backend/src/routes/index.ts` and exposes the formats, the book source list, the upload, the source detail, the versions, the passages, the preview, the apply, the links, the deletion, the chapter citations, the cited passage, the question and the summary. Every route is owner-scoped. An oversized body is refused by the body parser before the route runs and is reported as a rejected upload rather than a server fault.
- The research workspace lives at `/app/books/[bookId]/research` (`frontend/src/app/app/books/[bookId]/research/page.tsx`) and is reachable from a "Research" entry in the book navigation. `frontend/src/components/research/research-workspace.tsx` provides the import form (format, file, title, provenance, permission, with the size limit and the per-format limits explained before the upload), the source list with its extraction state, the source detail, the extraction preview with a selectable chapter mapping, the chapter-source picker, the question and summary panel with the passages it rests on, and the chapter-citations panel. Imported text is never written into the manuscript before the author confirms the preview, and the screen says so where the author would otherwise expect a write. A citation opens the exact supporting passage, and a citation whose source has changed is flagged as such.

Verification:

- **The full backend suite passed: 192 tests across 19 files** (`pnpm --filter backend exec vitest run`). The S11 suites are `backend/tests/sources.test.ts` (16 integration tests) and `backend/tests/pure-source-checks.test.ts` (26 deterministic tests without a database), 42 tests in total.
- The integration tests cover notes, DOCX and PDF extraction, a file whose bytes do not match its declared type, an oversized upload, the preview before any write, the confirmed import, a repeated confirmation, a confirmation naming a passage the version does not have, cross-user isolation, a supported question, an unsupported question, a question answered from another book's source, the chapter citations, and the source summary.
- The pure tests cover the passage splitter, the notes and DOCX readers, the upload acceptance rules, the proposed-chapter grouping, the retrieval ranking and the answer verification that turns an invented citation into an abstention.
- **The Puppeteer journey passed end to end** (`pnpm --filter e2e run e2e:sources`) against an isolated stack with the deterministic fake AI provider: dedicated database, separate Redis namespace, separate storage root and Mailpit. It signs up and verifies the OTP, creates and writes a book, opens the research workspace from the book navigation, imports a Markdown note, checks that the extraction produced passages with unique locators, checks that a binary file renamed to `.txt` is refused with 400, checks that the preview shows three proposed chapters while the chapter count is unchanged, confirms the import and checks that three chapters were added, confirms the same version again and checks that nothing changed, links the source to an existing chapter with a supporting passage, opens the cited passage and checks that it is not empty, asks a question the sources support and checks the answer is `supported` with visible evidence, and asks a question the sources do not support and checks that the answer is `unsupported`.
- The screenshots taken during the journey were reviewed. The workspace shows the import form, the extracted source with its state and provenance, the preview with three proposed chapters and their text, the applied banner reading "Imported 3 chapters into your manuscript.", the source listed as supporting three chapters, the answer with its two cited passages and their "Open passage" links, and the abstention reading "The sources do not answer this. None of the imported sources mention this topic."
- Shared, backend and frontend type checks passed; frontend lint passed; the frontend production build completed successfully, including TypeScript and static generation of all 26 routes with `/app/books/[bookId]/research` registered.

Three defects were found and fixed while building and verifying this package:

- A file whose bytes contradicted its declared type was reported as a server fault (500) because the extractor raised a plain error that the error handler did not recognise. Signature mismatches are now refused as rejected uploads (400), while a valid signature with corrupt content is still stored as a `failed` extraction.
- The passage counter restarted at each heading, so a document with several headings produced repeated locators (`p1`, `p2`, `p3`, `p1`, …) and a locator did not identify one passage. The counter now runs across the whole document, and a regression test in the pure suite pins it.
- The proposed chapter mapping was derived by guessing at the passage text, so a document whose heading sat with its own body produced one proposal instead of one per heading. The extractor now records the heading on the passage and the proposal step uses that recorded heading, so the mapping follows the document's own structure.

Two further corrections were made to make the behaviour match what the plan requires rather than what the first implementation did:

- Confirming an already-applied version returned a conflict (409). The plan asks for an **idempotent** confirmation, so it now returns the same result as the first confirmation and changes nothing. The integration test and the browser journey both assert this.
- The preview did not say whether a version had already been imported, so the screen could offer a confirmation that could not succeed. The preview now reports it, and the screen says so in place.

Release boundaries:

- **An answer is not a verified fact.** Answers and summaries are produced from the author's own passages by a language model. They can be wrong, and the workspace shows the passages they rest on so the author can judge them. The product makes no accuracy claim, and the abstention path exists because the model sometimes cannot ground an answer.
- The deterministic journey ran against the fake AI provider (`AI_MOCK=1`), so the wording of a live answer was not observed. What was verified is the contract: a supported question produces an answer with evidence, an unsupported one abstains, and an invented or missing citation becomes an abstention.
- OCR is not implemented. A scanned PDF is reported as `scanned` with no text; the author is told the file has no extractable text rather than being given an empty import.
- DOCX extraction reads the text of the main document part only. Tables are read as their text, and content in headers, footers, comments, footnotes, text boxes, charts, embedded objects and tracked changes is not extracted. A Word file that relies on those parts imports fewer words than it shows on screen.
- URL ingestion is deliberately not implemented, so there is no SSRF surface and no URL-import protection to claim. Adding it requires approved protocols, DNS and redirect revalidation, blocked internal addresses and bounded content and timeouts, as the plan states.
- Extraction runs inside the API process rather than in a separate isolated worker. The size, character and passage limits bound the work, but a hostile file is not processed in a sandboxed container.
- The file type is checked against its signature, not against a full structural validation. A crafted file that begins with the right magic bytes is still parsed by the format reader, which is why the corrupt-package paths are tested directly.
- The citation of a source whose file was deleted or replaced is flagged as changed in the research workspace, and the quality report cross-references those citations. This is recorded in the S11 follow-up below.
- The evidence was produced in the local environment with the fake AI provider and local storage. It was not run against a deployed stack, an S3-compatible object store or a production worker fleet. Migration `20261121090000_research_sources` was applied to the local E2E database; no remote push or production deployment was performed, and no paid provider call or real email delivery was made.

### S11 follow-up — citation impact in the quality report

The open item recorded above was that the research workspace flagged a changed citation but the quality report did not cross-reference it. That connection is now made.

**What was wrong, and what changed**

- Deleting a source deleted its `ChapterSourceLink` rows. The chapter then simply had no citation, so nothing recorded that it once rested on text that is gone, and a quality report had nothing to cross-reference. A deleted source is now a **tombstone**: the row is kept with `deletedAt` set, the stored file and the extraction are removed, and the links stay. Every source query filters on `deletedAt`, so a deleted source disappears from the list and from every retrieval path while its citations remain visible.
- A link recorded only the locators it cited, not the text they pointed at. A re-imported source therefore silently changed what an existing citation meant. A link now records the **source version** that was current when it was made and a **digest** of the cited passages, so revised text is detected instead of assumed.
- The state of a citation is decided in one place, `assessCitation` in `packages/shared/src/citations.ts`, and used by both the research workspace and the quality rules. The two cannot disagree about whether a citation still holds.

**States**

| State | Meaning |
| --- | --- |
| `current` | The cited passages still exist and still read the same. |
| `changed` | The source was re-imported, or the cited passages now hold different text. |
| `missing-passage` | A cited locator no longer exists in the source. |
| `deleted` | The source was deleted. |
| `unverifiable` | The source has no current text to check the citation against. |

**Quality rules**

The rules live in the `evidence` category, under a new check named *Citations whose source changed or was deleted*:

| Rule | Severity | Reported when |
| --- | --- | --- |
| `citation.source-deleted` | error | The cited source was deleted. |
| `citation.passage-missing` | error | A cited passage no longer exists. |
| `citation.source-changed` | warning | The source was re-imported or the cited text changed. |
| `citation.unverifiable` | info | The source has no current text to check the citation against. |

The report cross-references the citation; it does not judge whether the chapter still agrees with the source. That judgement stays with the author.

**Verification**

- 19 pure tests in `backend/tests/pure-citation-checks.test.ts` cover the digest, every citation state and the precedence between them (deleted over missing, missing over changed), and each quality rule.
- 12 integration tests in `backend/tests/citation-impact.test.ts` cover the tombstone, the hidden source, a re-imported source, a vanished passage, the four rules, owner isolation, and that the report is **redone** when a source is deleted, because the citations are part of the report fingerprint.
- The full backend suite passes: 223 tests across 21 files (up from 192 across 19, with no regressions).
- Shared, backend and frontend type checks pass; frontend lint passes; the frontend production build completes with all 26 routes.
- The browser journey `e2e/citation-impact-flow.e2e.ts` (`pnpm --filter e2e run e2e:citations`) passes end to end: sign up → verify → create a book → import a source → link it to a chapter → the citation is reported as **current** → the quality report says nothing about it → delete the source → the source leaves the list but the citation survives, flagged **Source deleted** → the quality report cross-references it with an `error` on the chapter.
- The original S11 journey `e2e/sources-flow.e2e.ts` was re-run and still passes, so the soft-delete change did not regress the import path.
- Migration `20261122090000_source_citation_impact` adds the `deletedAt` column and the two link columns, and was applied to the local and E2E databases.

**Boundaries of this follow-up**

- The report says that a citation is affected. It does not compare the chapter's own text against the source, so a chapter that has drifted from a source that is still intact is not detected.
- A citation whose passage was edited within the same version is detected by the digest, but only because the digest is recomputed from the current extraction. Links created before this migration have no recorded digest and are reported as `unverifiable` rather than as citations that still hold.
- The digest is a change detector, not a security control. It is a 32-bit FNV-1a hash so the shared package stays free of a Node dependency and usable in the browser; two different passages could in principle collide.
- The tombstone keeps the source title, the link and the locators. The passages themselves are deleted with the extraction, so a deleted citation cannot be re-opened; the report can say the text is gone but cannot show what it said.
- The evidence was produced locally against the fake AI provider and a local database. It was not run against a deployed stack or a production worker fleet, and no remote push or deployment was performed.

## S12 paid plans — 21 November 2026

Status: core implementation complete and verified locally against a local payment provider. **No live payment processor is connected and no money can be taken.** S13 remains the next ordered package.

### The release gate

> only verified payment state grants entitlements, and customer credit balances reconcile

Both halves are enforced by the server, not by the browser. The browser starts a checkout and shows a state; it never writes credits, entitlements or a payment status. The only path that grants value is a webhook whose HMAC signature the server has verified against the raw request bytes.

### What was built

**Shared contract** — `packages/shared/src/billing.ts`

- `Plan`, `Subscription`, `Payment`, `BillingState`, `CheckoutSession`, the entitlement keys and the payment/subscription statuses, with zod validation on the checkout body.
- The currencies are `USD`, `EUR` and `GBP`. Prices are stored as integer minor units, so a price is never a floating-point value.
- `eventGrantsCredits` names `payment.succeeded` as the only credit-granting event. `checkout.completed` is explicitly not one.
- `signWebhook` / `verifyWebhookSignature` cover the body and a timestamp, so a captured body cannot be replayed indefinitely. The comparison is constant-time.
- The HMAC-SHA256 and SHA-256 implementations are dependency-free so the shared package stays usable in the browser. They are checked against `node:crypto` by the tests.

**Provider boundary** — `backend/src/services/billing/provider.ts`

- A `PaymentProvider` interface with three duties: create a checkout, verify and parse a webhook, look up a subscription. The rest of the product does not know which provider it is talking to.
- The local provider is deterministic and explicitly **not live**: its identifiers come from the checkout's idempotency key, and it signs its events with `PAYMENT_WEBHOOK_SECRET`. It cannot take money.

**Data** — migration `20261123090000_paid_plans`

- `Plan`, `Subscription`, `Payment`, `PaymentEvent` and `Entitlement`, with the relations from `User`.
- A `Payment` records the provider's payment identifier, the provider's checkout identifier and the provider's customer reference, so a settlement event can be matched to the checkout it belongs to.
- `PaymentEvent` is the webhook inbox. The provider's event identifier is unique, so a repeat delivery is a no-op.
- `Payment.settledEventAt` and `Payment.refundedEventAt` carry the provider's timestamps, so an event that arrives out of order cannot undo newer state.

**Service** — `backend/src/services/billing/billingService.ts`

- A checkout creates a **pending** payment and nothing else. The idempotency key is `checkout:{userId}:{planId}`, so a second request returns the same pending payment instead of a second one.
- The webhook is verified against the raw bytes **before** the payload is parsed. An invalid signature is refused and nothing is written.
- Only a verified `payment.succeeded` grants credits. The credit grant carries the idempotency key `payment:{paymentId}`, so the ledger holds exactly one grant per payment.
- Entitlements are written only from verified payment or subscription state. A one-off plan's capabilities come from the payment; a recurring plan's capabilities come from its subscription, and they are withdrawn when the subscription is cancelled.
- A refund takes the credits back as far as the balance allows, so a customer who already spent them does not end up with a negative balance, and it withdraws the capabilities the payment granted. A second refund changes nothing.
- `reconcile` compares the wallet balance with the immutable credit ledger and reports the difference.

**Routes** — `backend/src/routes/billing.ts`

| Route | Who | What |
| --- | --- | --- |
| `GET /billing/plans` | public | The catalog of active plans, and the provider's name and whether it is live. |
| `GET /billing` | signed in | The author's subscription, entitlements, plans and payments. |
| `POST /billing/checkout` | signed in | Starts a checkout. Grants nothing. |
| `POST /billing/cancel` | signed in | Cancels the subscription and withdraws its capabilities. |
| `GET /billing/payments` | signed in | The author's own payments, newest first. |
| `POST /billing/webhook` | the provider | Raw-body, signature-verified event intake. Mounted before `express.json()`. |

**The local provider's own server** — `backend/src/routes/local-provider.ts`

A payment processor runs its own checkout page and then tells the merchant "this customer paid". The local provider stands in for that processor, so the merchant side is exercised exactly as it would be with a real one: `GET /api/v1/local-provider/pay/:session` shows the checkout the **merchant** created, and `POST` to it settles the payment by delivering a signed event through the same verification path a real callback takes. The route refuses to act when the build talks to a live provider.

### Verification

- 16 pure tests in `backend/tests/pure-billing-checks.test.ts` cover the currency rules, the entitlement rules, the credit-granting event set, the signature scheme and the hash vectors.
- 25 integration tests in `backend/tests/billing.test.ts` cover the catalog, checkout, signature failure (invalid, missing, expired), the credit grant, `checkout.completed` granting nothing, a failed payment granting nothing, a repeated event, an out-of-order event, an unknown customer, refunds, a repeated refund, owner isolation, reconciliation, the provider boundary, the local provider's payment page and the recurring subscription lifecycle.
- The full backend suite passes: **264 tests across 23 files**.
- Shared, backend and frontend type checks pass; the frontend lint passes; the frontend production build completes with **28 routes**, including `/app/credits/billing` and `/app/credits/checkout`.
- The browser journey `e2e/billing-flow.e2e.ts` (`pnpm --filter e2e run e2e:billing`) passes end to end: sign up → verify → the billing page shows the catalog and says the provider is not live → **a forged callback sent from the browser is refused and grants nothing** → a checkout is started and grants nothing on its own → the provider's payment page confirms it → the credits go from 100 to 600 and the capabilities appear → the payment is not counted twice → the subscription is cancelled and the capabilities are withdrawn.
- The S11 journeys `e2e/sources-flow.e2e.ts` and `e2e/citation-impact-flow.e2e.ts` were re-run and still pass, so the billing work did not regress the import or citation paths.
- The shared HMAC and SHA-256 outputs were compared directly with `node:crypto` and match.

### Boundaries

- **No live processor is connected.** The build talks to the local provider, which cannot take money and reports `providerLive: false`. Nothing here has been tested against a real processor's sandbox, and no money has moved.
- The local provider is deterministic, so it cannot reproduce a real processor's failure modes: network partitions between the processor and the merchant, duplicate deliveries in flight, clock skew, or a processor that changes its event shape. The webhook contract is written to survive those, but they are not demonstrated.
- The provider boundary covers checkout creation, webhook verification and subscription lookup. It does not yet cover a billing portal, saved payment methods, invoices, tax or a dunning process.
- The refund policy is deliberately simple: a refund takes the credits back as far as the balance allows and never creates a negative balance. A customer who already spent the credits has their capabilities withdrawn but keeps the spent credits unrefunded, and the difference is visible in the ledger rather than silently forgiven.
- The entitlement rules are published in the plan catalog, but the paid APIs do not yet gate on them. A free author can still call a paid endpoint directly; the entitlements exist and are recorded, but nothing reads them to deny a request yet. That is the remaining part of the gate and is not claimed here.
- The plan catalog is seeded at startup and seeded plans are never overwritten, so a price change is a deliberate act rather than a side effect of a restart.
- The evidence was produced locally against the fake AI provider, a local database and the local provider. It was not run against a deployed stack, and no deployment or remote push was performed.
