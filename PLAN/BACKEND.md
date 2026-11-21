# Detailed backend implementation plan

Follow S01–S16 in [IMPLEMENTATION_ORDER.md](./IMPLEMENTATION_ORDER.md). User journeys and screens are specified in [FRONTEND.md](./FRONTEND.md); test gates are in [ACCEPTANCE.md](./ACCEPTANCE.md).

## Architecture and implementation conventions

Preserve Express MVC: routes compose middleware; controllers translate HTTP; services own business rules; Prisma owns persistence; workers execute expensive work. Keep OpenAI, billing, credits, storage, exports and email behind service boundaries. Reuse current implementations instead of rebuilding working authentication, editing or PDF rendering.

Primary locations are `backend/src/{routes,controllers,middleware,services,queues}`, `backend/src/worker.ts`, `backend/prisma`, `backend/tests`, and `packages/shared/src`.

All paths below are proposed additions or extensions under `/api/v1`, except Better Auth routes, which remain framework-owned under `/api/v1/auth/*`. New entities and fields are proposed migration work, not existing database records.

### Contracts common to every module

- Validate body, params, pagination, operation type and relevant query fields with shared schemas. Validate persisted documents again at trust boundaries.
- Authorize the resource and its parent book/project; enforce soft-delete and archive semantics. An opaque ID is not authorization.
- Standardize errors as `{ error: { code, message, details?, requestId } }` for application APIs. Adapt framework-owned auth responses without assuming they match this envelope.
- Use `409` for stale versions, `402` for insufficient credits, `429` for throttling and safe retry hints for transient failures. Do not expose provider payloads or connection strings.
- Return `202` plus an operation ID for asynchronous work. Use one shared operation state model with queued/running/cancel-requested/completed/failed/cancelled states and explicit timestamps.
- Bind idempotency keys to owner, operation kind and normalized request hash. Return the stored result for the same request; reject reuse with different inputs.
- Freeze paid generation/export inputs and record schema versions. Keep provider/model/token usage and measured cost separate from product credits.
- Define units explicitly: asset pixels/bytes, print measurements, money in currency minor units, credits as integers, dates in UTC.
- Use stable pagination with a deterministic tiebreaker and bounded limits. Avoid returning document bodies in list responses.

### Migration and rollout rules

Prefer additive migrations, backfill existing rows safely, then enforce new constraints. Existing chapter content remains authoritative during section-model backfill; do not regenerate it. Test migrations against a copy of representative old data. Define compatibility while old/new workers coexist, and drain incompatible jobs before destructive changes. Record rollback and forward-repair procedures; do not rely on dropping tables to reverse a feature.

## S01 — Contracts, operation identity and environment isolation

Data: introduce a reusable operation record, request hash/idempotency identity, input snapshot, attempt/lease metadata, result reference, sanitized error and usage reference. Add transactional outbox records for queue dispatch where database-to-Redis atomicity is needed.

Implementation:

- [ ] Inventory current queue names, status strings, API responses, job/credit transitions and storage roots.
- [ ] Introduce a mandatory deployment/environment namespace for queue producers and consumers; migrate existing jobs deliberately.
- [ ] Add worker capabilities/version checks and a non-secret compatibility fingerprint for expected database/storage configuration.
- [ ] Define readiness checks for database, Redis, required storage and required worker capabilities separately from liveness.
- [ ] Implement operation lookup scoped to owner and resource; retain compatible current generation endpoints while migrating callers.
- [ ] Add database uniqueness constraints for idempotency and outbox identity; make the dispatcher replay-safe.
- [ ] Record request/operation correlation IDs in safe logs and API responses.

Contracts: `GET /operations/:operationId`; existing feature endpoints return a compatible operation reference. Readiness details are operator-facing; public health exposes only necessary state.

Tests/gate: duplicate requests return one operation, mismatched reuse is rejected, foreign owners cannot inspect jobs, two environment workers cannot cross-consume, and API/worker storage compatibility is verified.

## S02 — Editor validation, recovery contract and concurrency

Data: retain chapter OCC and immutable document revisions. Add document schema/version metadata if required; define bounded revision list pagination and user-controlled retention before deleting any history.

Implementation:

- [ ] Validate allowed TipTap nodes/marks, link protocols, image references, nesting depth and total payload size.
- [ ] Keep chapter update, revision snapshot, word count and book timestamp atomic; return the exact committed version.
- [ ] Include current server content/version in safe conflict responses; prohibit writes to actively generated content.
- [ ] Define version-aware recovery saves through the normal chapter PATCH endpoint. Local recovery must never bypass OCC.
- [ ] Support a version-aware chapter ordering operation with collision-safe positions and transaction boundaries.
- [ ] Define behavior for empty/title-only edits, deleted chapters, archived books and stale recovered drafts.
- [ ] Validate AI assistant actions and target version/range context. Cache paid results by operation identity and reject application to stale content.

Contracts: extend `PATCH /chapters/:chapterId`; retain revision list/detail/restore; add chapter reorder endpoint and version-aware AI suggestion metadata. Browser drafts remain client-side recovery data unless a separate authenticated draft-sync feature is explicitly added.

Tests/gate: concurrent save/restore races have one winner; failed validation creates no revision; recovery preserves edits; stale AI results do not silently replace current text.

## S03 — Durable generation, consistency and credits

Data: `Section` records keyed by chapter and stable position/ID; immutable job input snapshot; section completion/usage; rolling summaries; operation leases; transactional outbox. Add uniqueness for each chargeable completed unit.

Implementation:

- [ ] Backfill or represent existing chapters without changing their content or charging credits.
- [ ] Snapshot approved outline, BookBrief, author voice, language, terminology and generation policy at start.
- [ ] Define credit pricing for sections versus current chapter pricing, display estimates and preserve existing customer balances.
- [ ] Reserve credits and create the operation/outbox coherently; reconcile reservations whose queue dispatch failed.
- [ ] Claim exclusive work with lease renewal/fencing. A late worker must not commit after losing its lease.
- [ ] Persist section text, summary, usage, progress and charge identity at one transaction boundary; assemble chapters deterministically.
- [ ] Resume from persisted checkpoints, honour cancellation between units and settle unused reservations exactly once.
- [ ] Add bounded provider retries, timeouts, concurrency limits and budget caps. Distinguish safe replay from uncertain external completion.
- [ ] Check approved topics, repetition, chapter continuity and terminology; surface factual/citation uncertainty rather than fabricating references.

Contracts: extend existing generate/retry/cancel and job polling with completed units, partial content availability, reservation/charge totals and recoverability flags.

Tests/gate: kill/restart before/after each commit and dispatch boundary; replay deliveries; simulate lost leases and provider failures. Completed units and charges remain unique; cancellation and reconciliation restore the correct spendable balance.

## S04 — Durable OTP delivery and account recovery

Baseline: Gmail transport, authentication checks, four templates, sanitized logs and automated auth tests exist. Better Auth deliberately catches mail callback failures and can return neutral responses; HTTP success is not SMTP acceptance.

Data: `EmailDelivery` with idempotency identity, purpose, recipient reference, token-generation reference, encrypted short-lived payload, expiry, attempt state, accepted timestamp and sanitized failure code.

Implementation:

- [ ] Review installed Better Auth callback/adapter transaction boundaries before integrating the delivery outbox. Do not assume the verification row and callback outbox insert share a transaction.
- [ ] Preserve hashed verification tokens. Encrypt the minimum delivery payload because a hash cannot recreate the code; keep the encryption key outside the database and purge payloads after acceptance/expiry.
- [ ] Persist the delivery request before callback completion; add reconciliation for verified integration gaps without creating an unrestricted token lookup endpoint.
- [ ] Dispatch only eligible, unexpired messages for the current token generation. Suppress superseded codes and obsolete resend jobs.
- [ ] Retry transient SMTP failures with bounded exponential backoff/jitter, stopping before token expiry. Treat authentication errors and invalid recipients as permanent until corrected.
- [ ] Record ambiguous SMTP completion separately: inbox delivery cannot be made exactly once. A permitted retry must send the same still-valid code.
- [ ] Keep resend/attempt limits and neutral account-existence behavior. Add IP/account throttling with safe operator diagnostics.
- [ ] Add delivery queue age, acceptance/failure/expiry metrics, alerting and safe operator retry permissions.
- [ ] Retain `email:check`; use Mailpit/captured mail in routine tests and explicit self-test for live SMTP.

Contracts: framework-owned verification/reset routes remain compatible. Delivery detail is restricted to authorized operators; no public recipient lookup, token exposure or account-existence API.

Tests/gate: SMTP outage/recovery, expiry during retry, resent-code supersession, wrong-code limits, successful reset, code reuse, permanent failures and safe log redaction. UI wording and logs distinguish requested, accepted, failed and confirmed receipt.

## S05 — Projects, library and outline history

Data: archive timestamps distinct from deletion; project/book assignment; optional brief fields with defaults; outline version/concurrency token and approval linkage; stable section identifiers.

Implementation:

- [ ] Add project update and assignment/reassignment with ownership checks on both objects.
- [ ] Add archive/restore, search, filter/sort and paginated book/project listings.
- [ ] Define duplication as an explicit copy of selected content/design references with new identities and correct asset ownership.
- [ ] Extend brief purpose, reader age/problem/outcome, style, point of view, author/brand defaults and preferred terminology.
- [ ] Expose outline history/detail/restore, and bind approval to an immutable outline version.
- [ ] Describe the impact of outline edits on written chapters; require an explicit preservation/mapping decision for destructive structural changes.

Contracts: `PATCH /projects/:id`; project assignment, archive/restore and duplicate actions; `GET /books/:id/outlines`, detail and version-aware restore/approve.

Tests/gate: pagination remains stable across ties; users cannot assign books to foreign projects; archive differs from deletion; restoring or reordering an outline preserves existing writing.

## S06 — Private assets and safe uploads

Data: `Asset` with owner/book, kind, media metadata, content hash, provenance, storage reference, lifecycle status, alt text/caption and reference tracking.

Implementation:

- [ ] Define initial file-type and byte/pixel limits; validate signatures, decoded dimensions and decompression/resource budgets.
- [ ] Quarantine incoming files; scan/process as appropriate; prohibit active HTML/SVG or sanitize using an explicit policy before support.
- [ ] Store only server-controlled storage keys. Never treat arbitrary URLs as trusted internal assets.
- [ ] Add authenticated upload/finalization/retrieval, bounded signed links where appropriate, and safe MIME/disposition headers.
- [ ] Prevent deletion of referenced assets or require an explicit replacement workflow; protect historical export snapshots.
- [ ] Reconcile abandoned uploads, orphaned objects and storage metadata failures with retention rules.

Contracts: book asset list/upload/finalize, asset metadata PATCH, authorized content/download and delete. Return safe thumbnail/preview references and processing state.

Tests/gate: invalid signatures, oversized/decompression-heavy input, foreign-owner access, interrupted upload, referenced deletion and orphan cleanup. API and worker retrieve the identical stored artifact.

## S07 — Covers and interior illustrations

Data: `ImageGeneration`, immutable prompt/style input, generated `Asset` links; `CoverDesign` version with artwork reference, normalized text positions, typography, palette and output settings.

Implementation:

- [x] Add an OpenAI image-provider adapter using configured model/capabilities, queue limits and server-enforced cost estimates.
- [x] Reuse operation/reservation/outbox patterns; preserve previous concepts when regeneration fails.
- [x] Generate artwork without required title typography; compose title/subtitle/author with editable deterministic overlays.
- [x] Save book visual direction, illustration palette, character descriptions and aspect ratios; do not promise perfect image consistency.
- [x] Render high-resolution composed covers with licensed fonts and validate dimensions/file availability.
- [x] Support chapter image references, alt text and captions through document validation and rendering.

Contracts: image generate/history/status, cover GET/PUT with OCC, select-artwork and composed-cover export. Avoid adding unvalidated client-supplied provider parameters.

Tests/gate: insufficient credits, provider timeout, cancellation, duplicate requests, overlay escaping, multilingual typography, reopened designs and export fidelity.

## S08 — Interior design and multilingual rendering

Data: `TemplateVersion`, `BookDesignProfile` with separate reflowable/print settings, structured front/back matter and approved font metadata. Applying a template snapshots settings rather than following future template changes silently.

Implementation:

- [x] Define a normalized book document from chapter/revision metadata, design and asset references.
- [x] Centralize typography, spacing, table/image rules and language/direction handling for preview/export adapters.
- [x] Store trim size, margins, print headers/footers and page numbering separately from digital typography preferences.
- [x] Support title/copyright/dedication/author/reference matter and navigable table of contents.
- [x] Version design edits with OCC and reversible template application.
- [x] Approve font embedding rights, bundle dependable fonts and define fallback diagnostics for unsupported glyphs.
- [x] Define how Bengali shaping, mixed-script paragraphs, RTL ordering, CJK line breaking and Unicode normalization are preserved.

Contracts: template list/detail; version-aware book design GET/PUT/apply/restore; normalized preview data and supported language/font capabilities.

Tests/gate: existing books obtain safe defaults; print/digital rules stay distinct; language fixtures and long content render predictably; design changes are reproducible and reversible.

## S09 — Quality reports and consistency review

Data: `QualityReport` with manuscript/design/assets fingerprint, checker/rules version, findings/category summaries; `QualityFinding` with stable anchors, severity, evidence, review status and detection method. Add versioned book context for voice, terms, definitions and chapter summaries.

Implementation:

- [x] Implement deterministic checks for missing/empty content, heading hierarchy, repeated passages, broken assets/links, metadata and alt text.
- [x] Add AI-assisted clarity, repetition, terminology and contradiction review behind a separate costed operation.
- [x] Require findings to point to actual anchors and supporting excerpts; discard malformed or unverifiable model references.
- [x] Flag facts/citations requiring evidence without claiming verified accuracy or originality.
- [x] Mark reports stale when relevant input versions change; maintain user review/dismissal notes with attribution.
- [x] Treat applying a fix as a normal version-aware editor change; never mutate the manuscript silently during analysis.
- [x] Measure false positives/negatives against curated flawed and clean fixtures before enabling aggregate scores.

Contracts: costed report creation, list/detail, finding review update and anchor lookup. Make any score methodology and incomplete coverage explicit.

Tests/gate: injected defects are found and correctly located; clean content is evaluated for false positives; stale reports and human-review findings are visibly distinct.

### S09 implementation checkpoint — 20 November 2026

Core quality review is implemented. Versioned `book_contexts` now carry voice, terminology, agreed definitions and per-chapter summaries. Deterministic checks cover empty and short content, heading hierarchy, repeated passages, broken assets and links, metadata, alt text, script mismatch, unsupported glyphs, terminology variants, cross-chapter numeric contradictions, competing definitions and out-of-date chapter summaries. The costed AI review returns clarity, repetition, consistency, contradiction and evidence findings; each quoted reference is verified against the chapter and unverifiable model references are discarded and counted.

Cross-chapter contradiction detection compares the same subject and unit measured in different chapters and reports the later claim against the earlier one; same-chapter and different-unit pairs are not compared. Definition conflicts fire only when a chapter states a competing definition for a term the book context defines, and summary gaps fire only when most content words of an author summary are absent from the chapter.

No aggregate score is produced. Findings that need human review are marked as such and state that eBookStudio does not verify facts or sources. See [ACCEPTANCE.md](./ACCEPTANCE.md) for evidence and the limits that remain open.

## S10 — Validated PDF, EPUB and DOCX

Data: export input snapshot linking exact manuscript/design/asset versions; format/options, validation report, artifact metadata/hash and availability status.

Implementation:

- [x] Introduce a renderer registry consuming the normalized book document; preserve the current PDF implementation during refactoring.
- [x] Snapshot all required inputs and pin asset references before enqueueing; retain them for the export retention period.
- [x] Extend PDF options for digital/print layouts and check fonts, links, TOC, images, margins and relevant bleed settings.
- [x] Build EPUB package metadata, navigation, cover, XHTML/CSS and internal resource references; integrate EPUBCheck and separate accessibility checks.
- [x] Build DOCX styles, headings, lists, tables, images, relationships, hyperlinks and relevant page breaks; validate archive parts and reopen outputs.
- [x] Do not promise an automatically updated DOCX TOC across all editors; test the chosen implementation and describe required refresh behavior.
- [x] Store the file, verify readability from the same storage path used by downloads, then mark ready. Recover missing/corrupted artifacts explicitly.
- [x] Record validation errors and warnings, correct MIME/filename, size/hash, and page count only for meaningful fixed-layout outputs.

Contracts: extend existing export request/list/download with format/options and validation summary; add immutable detail and permitted regenerate action.

Tests/gate: actual PDF/EPUB/DOCX download, validation and opening in representative software; missing storage, bad assets, interrupted upload, long tables and multilingual/RTL fixtures. Validation success does not imply marketplace approval.

Status: core implementation complete and verified locally. The renderer registry, immutable request-time snapshots, the EPUB 3 and DOCX renderers, the three validators, storage read-back, SHA-256 and content types, and the export detail/download routes are implemented and covered by backend tests. The browser journey downloads real PDF, EPUB and DOCX artifacts. EPUBCheck and separate accessibility checks are not integrated: the EPUB validator checks the package structure itself. Representative-reader review in Kindle Previewer, Apple Books and Microsoft Word remains outstanding. See ACCEPTANCE.md for the evidence record and the release boundaries.

## S11 — Imports and source-based research

Data: `ImportJob`, `ResearchSource`, `SourceVersion`, extracted passage/locator records, chapter-source links, citation/evidence links and provenance/license notes. Reuse private assets and operation infrastructure.

Implementation:

- [x] Start with notes, DOCX and text-extractable PDF; state unsupported scanned/OCR cases until OCR is implemented and validated.
- [x] Parse in isolated, resource-limited workers; reject active content, unsafe archives and oversized documents. Preserve original files privately.
- [x] Store extraction warnings and a proposed chapter mapping; require explicit confirmation before applying changes.
- [x] Make import application idempotent and version-aware; append/create by default rather than overwriting existing manuscripts.
- [x] Persist extracted source passages with stable page/paragraph locators and version hashes.
- [x] Add source-grounded summaries and Q&A with retrieved passages and evidence links. Abstain when sources do not support an answer.
- [x] Treat imported instructions as untrusted document content, not privileged AI instructions.
- [ ] Add URL ingestion only after SSRF controls: approved protocols, DNS/redirect revalidation, blocked internal addresses, bounded content and timeouts.
- [x] Enforce source deletion/retention semantics and flag citations broken by changed/deleted sources; update quality findings accordingly.

Contracts: import upload/status/preview/confirm; source CRUD/version/excerpts, chapter association, source-summary and Q&A operations.

Tests/gate: corrupted/hostile files, extraction warnings, repeated confirmation, cross-owner sources, unsupported questions, accurate passage links, prompt injection and SSRF attempts.

Status: core implementation complete and verified locally. `packages/shared/src/sources.ts` holds the shared contract (formats `notes`/`docx`/`pdf`, 5 MiB upload limit, 400,000-character extraction limit, 4,000-character passages, 2,000 passages, extraction states `ready`/`empty`/`scanned`/`failed`). The schema adds `ResearchSource`, `SourceVersion` and `ChapterSourceLink`, migrated by `backend/prisma/migrations/20261121090000_research_sources/migration.sql`. `backend/src/services/sources/extractors.ts` checks the declared type against the file signature and refuses empty, oversized, renamed-binary, corrupt and unsupported files; the DOCX reader reads only `word/document.xml` and never executes macros, embedded objects or external references; image-only PDFs are reported as `scanned` because OCR is not implemented; the notes reader keeps a heading with its own text and records the heading on the passage. Passage locators (`p1`, `p2`, …) are numbered across the whole document, so a locator always identifies one passage. `backend/src/services/sources/sourceService.ts` performs upload, extraction, preview, transactional apply, chapter linking and deletion; applying a version is idempotent because the version is claimed by setting `appliedAt` inside the transaction, so a repeated confirmation returns the same result and never duplicates chapters. `backend/src/services/sources/researchService.ts` and `backend/src/services/ai/sourceAnswerer.ts` answer questions and write summaries from retrieved passages only, turn an invented or missing citation into an abstention, and treat passage text as quoted evidence rather than instructions. `backend/src/routes/sources.ts` is registered in `backend/src/routes/index.ts`.

Deletion semantics and citation impact are implemented. A deleted source is a tombstone: `backend/prisma/migrations/20261122090000_source_citation_impact/migration.sql` adds `ResearchSource.deletedAt` and the link columns `sourceVersion` and `passageDigest`. `sourceService.remove` deletes the stored file and the extraction but keeps the source row and its links, so a chapter that cited the source still cites it and the loss is reportable; every source query filters on `deletedAt`, so a deleted source leaves the list and every retrieval path. A link records the source version it was made against and a digest of the cited passages, so a re-imported source or revised text is detected rather than silently changing what the citation means. `packages/shared/src/citations.ts` holds `assessCitation`, the single place that decides whether a citation is `current`, `changed`, `missing-passage`, `deleted` or `unverifiable`; the research workspace and the quality rules both use it, so they cannot disagree. `backend/src/services/quality/checks.ts` adds the `citation.source-deleted` (error), `citation.passage-missing` (error), `citation.source-changed` (warning) and `citation.unverifiable` (info) rules in the `evidence` category, and the citations are part of the report fingerprint, so a report is redone when a source is deleted or re-imported. The report cross-references the citation; it does not judge whether the chapter still agrees with the source.

The full backend suite (223 tests in 21 files, including 73 source and citation tests), the shared, backend and frontend type checks, and the frontend lint and production build pass. The browser journeys `e2e/sources-flow.e2e.ts` and `e2e/citation-impact-flow.e2e.ts` both pass. URL ingestion is deliberately not implemented, so there is no SSRF surface to test. See ACCEPTANCE.md for the evidence record and the release boundaries.

## S12 — Payments, plans and entitlements

Data: plan/price versions, `Subscription`, `Payment`, provider event inbox, entitlement grants, purchase/top-up identity and ledger references. Store currency and integer minor units; do not infer prices from client input.

Implementation:

- [x] Resolve provider/region/currency and explicit renewal, cancellation, refund, grace-period and credit-expiry policies. The currencies are USD, EUR and GBP, stored as integer minor units. The provider boundary is defined; the build talks to a deterministic local provider that cannot take money and reports `providerLive: false`.
- [x] Add provider adapter and server-created checkout. The `PaymentProvider` interface covers checkout creation, webhook verification/parsing and subscription lookup. A billing portal is **not** implemented.
- [x] Verify raw-body webhook signatures before processing; persist event identity and apply changes transactionally/idempotently. The webhook route is mounted before `express.json()` so the exact bytes are verified. The inbox is keyed on the provider's event identifier, so a repeat delivery is a no-op.
- [x] Handle out-of-order events using provider object state/version and reconciliation; a redirect alone grants nothing. `Payment.settledEventAt` and `Payment.refundedEventAt` carry the provider's timestamps, and a stale event is ignored. Only a verified `payment.succeeded` grants credits; `checkout.completed` grants nothing.
- [x] Enforce feature access, rate limits and quotas on every paid API, including direct requests outside the UI. Entitlements are read on the server for book limits, outline approval and source-to-chapter application, so a direct request is refused the same way the UI is. Paid jobs take priority in the queue, and entitlement reads are transaction-aware.
- [x] Separate the capabilities the product publishes as free from the ones a plan sells. `FREE_TIER_ENTITLEMENTS` in `packages/shared/src/billing.ts` names export and private source import as the baseline every author holds, because the export screen says "Free to export" and the credits screen prices a PDF export at Free. They are never written as entitlements and a refund cannot withdraw them. What a plan sells is the quota and priority set: `maxBooks`, `maxChaptersPerBook` and `priorityJobs`. Gating export or source import behind a plan would refuse a free author for a capability the product gives away, and the UI would contradict the API.
- [x] Add top-up and renewal grants with immutable unique ledger identities; preserve auditability for refunds/adjustments. A grant carries the idempotency key `payment:{paymentId}`, so the ledger holds one grant per payment.
- [x] Define how refunds interact with already-spent credits; never silently create spendable balances inconsistent with policy. A refund takes the credits back as far as the balance allows and never goes negative; the difference stays visible in the ledger.
- [x] Add provider reconciliation and safe replay procedures. `reconcile` compares the wallet balance with the immutable credit ledger. The provider's subscription lookup exists; a general replay tool does not.

Contracts: plan catalog, entitlements, checkout, subscription status/actions and provider webhook are implemented in `packages/shared/src/billing.ts`; the portal contract is not. Credits history is not yet extended with usage references and pagination.

Tests/gate: 16 pure tests and 25 integration tests cover signature failure, duplicate/out-of-order events, abandoned checkout, cancellation, refunds and reconciliation; the full backend suite is 350 tests across 29 files. The processor sandbox **has** now been validated against Stripe's own sandbox through the Stripe CLI listener - see the S12 live processor checkpoint below.

Data: explicit roles/permissions, immutable admin audit entries, operational incidents/feedback, usage aggregates, backup manifests and restore evidence references.

Implementation:

- [ ] Define permissions for support, finance and administrator actions; bootstrap initial administrators through an explicit operational procedure.
- [ ] Add role checks independent of frontend navigation. Limit sensitive content and delivery data to justified support access.
- [ ] Audit actor/target/action/reason/outcome for credit adjustments, job interventions, template changes and account actions.
- [ ] Expose operational APIs for users/books, transactions/subscriptions, credits, AI usage, jobs, deliveries, templates and audit history.
- [ ] Allow only safe idempotent interventions; retry/cancel operations must use services rather than direct database edits.
- [ ] Monitor queue age, delivery failures, export availability, provider latency/spend, failed payments and reconciliation gaps.
- [ ] Test alert delivery to an explicitly configured destination; apply log redaction and retention.
- [ ] Back up database and assets coherently, encrypt backups, restrict access and define approved RPO/RTO targets.
- [ ] Restore into an isolated environment, verify referential integrity and open recovered artifacts. Define schema compatibility and disaster procedures.
- [ ] Add authenticated feedback/support submission with rate limits and correlation IDs; do not send external messages without configured authorization.

Tests/gate: every privileged route rejects ordinary users; audited adjustments reconcile; safe retries preserve billing; alerts arrive; the full backup restore meets approved recovery targets.

## S14 — Distribution preparation

Data: versioned destination profiles/rules, book metadata, package snapshots and artifact references, checklist state and user-reported publishing status.

Implementation:

- [ ] Recheck official destination specifications during implementation and record reviewed date/rules version.
- [ ] Keep KDP eBook and print preparation separate; add Apple Books, Etsy, Gumroad and own-website profiles.
- [ ] Validate metadata and required files against the selected profile using actual artifact properties.
- [ ] Assemble a ZIP from pinned validated exports, cover, metadata/listing text and instructions; sanitize archive paths.
- [ ] Mark packages stale when inputs change and support regeneration without losing prior packages.
- [ ] Track manually entered publishing status and external listing links without claiming platform confirmation.

Contracts: destination capabilities, package request/list/detail/download, metadata/checklist updates and user-managed publishing status.

Tests/gate: archive contents/checksums, missing required files, stale inputs, foreign-owner downloads and separate eBook/print requirements. Direct account connection/publication stays unavailable without a supported integration.

## S15 — Marketing assets

Data: typed marketing assets, version history, manuscript/brand input snapshots, generation operation and optional composed graphic references.

Implementation:

- [ ] Define schemas for descriptions, author bios, summaries, sales copy, keywords/tags, emails, captions, carousel text and short-video scripts.
- [ ] Generate from actual book content and approved author/brand facts; prohibit invented testimonials, endorsements, statistics or sales guarantees.
- [ ] Reuse operation/cost limits and persist output variants before marking complete.
- [ ] Support version-aware user edits, regeneration as a new variant and safe text/graphic downloads.
- [ ] Build promotional graphics deterministically around approved artwork and editable text; apply font/license rules.
- [x] Produce sample chapters from selected manuscript snapshots and check output availability. `backend/src/services/marketing/marketingAssets.ts` assembles a pack from the chapters the author names, through the same renderer and the same validator the export path uses, so a pack that would not open is refused rather than offered. `buildBookDocument` gained a `chapterIds` option so a sample is built from the chosen chapters rather than a copy of the book.
- [ ] Flag stale source inputs and clearly separate generated drafts from user-approved materials.

Contracts: asset generation/list/detail/update/history and downloads; no automatic external posting/email campaigns in this scope.

Tests/gate: variants persist, edits survive regeneration, costs settle once, claims reflect sources and downloaded assets are safe and readable.

## S16 — Production hardening and evidence

- [ ] Run migration/backfill compatibility checks and the complete acceptance matrix against a release build in staging.
- [ ] Review authentication, authorization, origin/CSRF controls, upload/import isolation, SSRF, payment signatures and secret handling.
- [ ] Benchmark real OpenAI samples and costs under approved budgets, separate from mocked regression.
- [ ] Load-test representative book sizes, active editors and worker concurrency; set measured time/memory/queue budgets.
- [ ] Exercise process termination, Redis outage, unavailable storage, expired leases, email outage and payment replay.
- [ ] Rehearse rollout/rollback, backup restore, alert receipt and incident response.
- [ ] Record runtime/dependency versions, configuration, artifact identity and unresolved limitations; block release on failed critical gates.

Existing commands: `pnpm --filter backend typecheck`, `pnpm --filter backend test`, `pnpm --filter backend build`. Tests require isolated PostgreSQL/Redis; ordinary tests must never send real Gmail mail or make paid AI/payment calls.

## Proposed data dependencies

| New domain | Core relations and constraints |
| --- | --- |
| Operations/outbox | Owner/resource, immutable request identity, unique dispatch/charge keys, bounded result retention |
| Sections/context | Book → chapter → ordered section; immutable input version; unique completion/usage identity |
| Email delivery | Purpose/token generation, encrypted short-lived payload, expiry, attempts and safe operational status |
| Assets/covers/design | Owner/book, private storage, versioned overlays/templates, reference retention for exports |
| Quality/research | Input fingerprints, stable document/source anchors, evidence links, review attribution |
| Exports/packages | Immutable manifest of manuscript/design/assets, validation and available artifacts |
| Billing/admin | Unique verified provider events, entitlement/ledger references, role checks and immutable audit |
| Marketing | Typed variants, source snapshots, user edits and graphic asset references |

Choose final Prisma names and indexes after inspecting the existing schema. Add foreign keys and uniqueness constraints for invariants; service checks alone are insufficient under concurrent requests.


## Marketplace priority update — 20 November 2026

See [MARKETPLACE_RELEASE.md](./MARKETPLACE_RELEASE.md) for the requested KDP/Etsy/Gumroad release sequence, implemented destination checks, and remaining gates. Current editor and marketplace verification is recorded in [ACCEPTANCE.md](./ACCEPTANCE.md); roadmap specifications elsewhere in this document must not be read as completion claims.


## S03/S04 implementation checkpoint

Generation snapshots/checkpoints, worker fencing, transactional reservations/settlement, and durable encrypted OTP delivery are implemented. Saved-section recovery status and neutral OTP wording are integrated in the frontend. See the dated [acceptance evidence](./ACCEPTANCE.md) and runtime/email runbooks for tested scenarios and remaining cutover limits. S05 is next; later specifications remain planned rather than implied complete.


## S05 implementation checkpoint

Core project management, library filtering/pagination, archive/restore, independent duplication, richer brief fields/recovery, and version-bound outline history are implemented and locally verified. Restoring planning preserves written chapters; destructive mapping and nested sections remain unsupported. See [ACCEPTANCE.md](./ACCEPTANCE.md) for the 72-test and browser evidence, API token changes, and specific UX/recovery limits. S06 private assets is next.


### S06 implementation checkpoint — 20 November 2026

Private image metadata, sanitization, owner retrieval, transactional reference pins, retryable cleanup and PDF byte resolution are implemented. Protocol 3 requires coordinated API/worker cutover. See ACCEPTANCE.md for limits and production evidence still required.


### S07 implementation checkpoint — 20 November 2026

Core cover/illustration generation and editable typography are implemented. See ACCEPTANCE.md for the verified scenarios and release limits. Image jobs reuse GenerationJob, operation/credit/outbox and lease infrastructure; cover designs use immutable versions. Four vendored Noto families support the tested fixtures. Full production provider verification, print covers, broader script coverage and release packaging remain pending.


### S08 implementation checkpoint — 20 November 2026

Core interior design is implemented: immutable `BookDesign` versions (save/template/restore) with OCC; versioned template definitions shipped in `packages/shared` and stored as full snapshots instead of a `TemplateVersion` table; separate digital and print profiles; structured front/back matter; one normalized document and renderer for reader preview, print preview and PDF export; exports freeze the design at request time. Static, hash-pinned OFL fonts replace Google Fonts at render time. CJK faces come from `fonts:fetch`. Runtime protocol 5 and migration `20261120190000_book_design` require a coordinated cutover. See ACCEPTANCE.md and RUNTIME.md for evidence and limits. The EPUB and DOCX adapters are implemented in S10.

### S13 implementation checkpoint — 21 November 2026

Operations and administration are implemented: three roles with explicit permission bundles, server-side permission checks on every privileged route, and an immutable audit record for every privileged action. Operational views cover the dashboard, customers, books, jobs, payments, incidents, alerts, support, roles, backups and the audit trail. Credit adjustments and refunds go through the credit service so they land in the same immutable ledger as every other movement, and a negative balance is refused. Backups capture a plain SQL dump and the local asset tree with SHA-256 checksums and manifest counts; a restore is rehearsed against an isolated database and compared with the manifest, never against the live one. Migration `20261124090000_s13_operations` was added and applied. See ACCEPTANCE.md for the verified scenarios and the boundaries — in particular the missing tests for a failed alert delivery, a job intervention and a refund through the admin routes.

### S14 implementation checkpoint — 21 November 2026

Distribution preparation is implemented: six destination profiles with their own required and accepted formats, cover rules, package limits and metadata; package assembly from the author's own finished exports with the cover, destination metadata and a README; validation that separates hard blockers from checks that need a human and never claims a store approval; ownership enforced for books, exports, packages and downloads; a blocked package answered with 422 and a ready one with 201; and the author's own publishing status. Migration `20261125090000_s14_distribution` was added and applied. See ACCEPTANCE.md — EPUBCheck, separate EPUB accessibility validation and the representative reader checks remain pending.

### S15 implementation checkpoint — 21 November 2026

The marketing studio is implemented for the core output set: nine typed outputs with published credit costs, editable drafts that carry the manuscript versions they were written from, stale-input detection with a 409 and `STALE_VERSION`, regeneration that writes a new draft instead of overwriting the original, explicit approval, claim checks that flag guarantees, endorsements, unsupported efficacy claims and pricing claims, and promotional graphic compositions through the private asset pipeline. Migration `20261126090000_s15_marketing` was added and applied. See ACCEPTANCE.md — sample chapters are assembled from the manuscript's own chapter versions and downloaded as a validated file, and the composed graphic is rendered locally and inspected as a real image.

### S16 implementation checkpoint — 21 November 2026

The release build compiles and the acceptance matrix is exercised locally, but **the release gate is closed**. The backend suite passes with 350 tests across 29 files, the type check and build pass, and the browser journeys for billing, sources, citation impact and S13–S16 all pass with no browser-console errors. The live processor path has now been validated against Stripe's own sandbox through the Stripe CLI listener. The gate remains closed because `STRIPE_WEBHOOK_SECRET` is empty in the working environment, no real OpenAI output or cost has been measured, and no load, security or accessibility review has been performed. See ACCEPTANCE.md for the full list of boundaries and the next four things.
### S12 live processor checkpoint — 21 November 2026

The provider boundary is now exercised against Stripe's own sandbox, with the Stripe CLI delivering events to the running backend. `PAYMENT_PROVIDER=stripe` selects the native Stripe provider, which creates Checkout Sessions, verifies webhook signatures against the raw request bytes, and converts Stripe's own event shapes into the product's provider events.

What the live journey (`e2e/stripe-live.e2e.ts`, `pnpm --filter e2e run e2e:stripe`) proves:

- A checkout opens a real Stripe Checkout Session and grants nothing on its own.
- A forged callback posted from the browser is refused with HTTP 400 and grants nothing.
- The checkout paid on Stripe's hosted page produces a verified event that grants 500 credits and the plan's capabilities (balance 100 → 600).
- The same event delivered again grants nothing further.
- The payment is recorded as settled, carrying both the Stripe payment intent id and the checkout session id.

Three defects were found by that journey and fixed:

1. **The settled event named a payment, while the pending record was written against a checkout.** Stripe does not put a session's id on its payment intent, so a genuine payment could never be matched to its checkout and every settled payment was refused with `No local checkout matched this payment`. Fixed by carrying `providerCheckoutId` on the provider event, matching a pending payment by **either** identifier, writing the real payment id back onto the record, recording the session id on the intent when the checkout is opened, and — when an event still names only the payment — asking Stripe which checkout it belongs to. A failed lookup leaves the event unmatched rather than guessing.

2. **An event that named no customer could not be attributed to anyone.** The service now falls back to the pending payment record, which the product wrote and which holds the customer reference. The fallback only applies when the event names no customer at all, and the reference still has to resolve to a known user.

3. **A settled event for an unknown checkout wrote a second payment row** under a placeholder identifier, which looked like a second checkout for the same money and left the real one unsettled. A row is now written only when the event names a real checkout, and never over the unique checkout identifier.

The entitlement line in the S12 section above is now implemented: entitlements are read on the server for exports, sources, book limits, outline approval and source-to-chapter application, and paid jobs take priority. The full backend suite passes with 350 tests across 29 files.

The boundaries that remain are recorded in ACCEPTANCE.md: this is a sandbox and not a live processor, the root `.env` does not carry `STRIPE_WEBHOOK_SECRET` so webhook verification fails safely there until it is configured, and a billing portal, grace and dunning states, and a published refund, expiry and downgrade policy are not implemented.
