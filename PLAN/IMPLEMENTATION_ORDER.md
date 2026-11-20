# Ordered implementation work packages

Use matching step IDs in [BACKEND.md](./BACKEND.md), [FRONTEND.md](./FRONTEND.md), and [ACCEPTANCE.md](./ACCEPTANCE.md). S01 foundation is implemented and verified. S02 edit protection and initial S14 destination checks are implemented; additional S02 resilience evidence and full S14 packaging remain pending. S03 generation recovery and S04 durable OTP delivery are implemented with evidence and cutover limits in ACCEPTANCE.md. S05 core library/planning is implemented and verified locally, with limits in ACCEPTANCE.md. S06 core private images are implemented with local verification. S07 core cover/illustration generation and editable typography are implemented with local verification. S08 core interior templates, multilingual typesetting and reader/print previews are implemented with local verification. S09–S13 and S15–S16 remain planned. See the evidence record in ACCEPTANCE.md for scope and limits.

For each package: confirm contracts → write migration and service → integrate UI → run targeted failure tests → demonstrate the user journey → record evidence → enable the capability. Avoid replacing a working workflow with a placeholder during development.

## S01 — Establish shared contracts and isolate environments

1. Inventory current routes, models, statuses, queue consumers and storage locations.
2. Define shared operation/error/pagination contracts and request idempotency rules.
3. Introduce environment-specific queue names/prefixes and worker readiness checks.
4. Define compatible database/storage configuration checks without exposing connection strings.
5. Add operation status UI and correlation IDs for support.
6. Prove a local worker cannot consume staging/production jobs and a stored artifact can be downloaded by its matching API.

Gate: isolated environments, private resources, compatible consumers and documented contracts. Do not proceed with new paid jobs until this gate passes.

## S02 — Protect manuscript edits

1. Harden structured document validation and maintain atomic revision/OCC saves.
2. Persist browser drafts with user/chapter/base-version identifiers and a recovery journal.
3. Add manual Save, offline state, save failures and navigation protection.
4. Define explicit draft recovery choices when server and browser versions diverge.
5. Verify history restores and AI suggestions against concurrent changes.
6. Test crash/reload, two tabs, offline reconnection, logout/account change and storage failures.

Gate: recovery retains the user's work and never silently overwrites a newer server version.

## S03 — Make generation restart-safe

1. Add generation input snapshots, ordered section records and durable operation identity.
2. Implement exclusive processing, section checkpoints and credit usage at the same commit boundary.
3. Add outbox dispatch/reconciliation for database-to-queue gaps.
4. Expose resume/cancel/retry states and estimated costs in the UI.
5. Check continuity using approved outline, voice, terminology and prior section/chapter summaries.
6. Interrupt workers at each checkpoint and replay deliveries; compare content and credit ledger.

Gate: finished sections survive interruption and duplicate requests cannot charge or commit twice.

## S04 — Make OTP delivery recoverable

1. Preserve the working Gmail transport, diagnostics, hashed OTPs and neutral account responses.
2. Add a durable delivery record, encrypted short-lived payload and idempotent dispatch.
3. Implement bounded retries, expiry, permanent-failure handling and resend invalidation checks.
4. Add email operational metrics and operator retry rules that cannot revive expired tokens.
5. Improve verification/reset UI states without exposing whether an account exists.
6. Test outage/recovery, expiration, attempts, repeated resend and both TLS modes with test infrastructure.

Gate: eligible messages recover from transient failure; expired/superseded codes are not sent as usable codes; SMTP acceptance and inbox receipt remain distinct.

## S05 — Organize books and preserve planning versions

1. Add project update, assignment, archive/restore, filtering and stable pagination.
2. Extend optional BookBrief fields with backward-compatible defaults.
3. Add outline version access and safe restore with versioned approval.
4. Build projects, library filters and outline history screens.
5. Preserve manuscript content when an outline changes; show the impact before confirmation.
6. Verify cross-owner rejection and archived/deleted resource behavior.

Gate: users can manage several books and recover earlier planning without losing writing.

## S06 — Establish a private asset pipeline

1. Add asset metadata, owner/book relations and storage lifecycle states.
2. Validate and safely process uploads before marking them available.
3. Add authenticated retrieval, reference tracking and deletion protection.
4. Build upload progress, library browsing, alt text/caption editing and failure states.
5. Confirm API/worker storage compatibility and orphan cleanup.
6. Test malformed, oversized, cross-owner and referenced asset deletion cases.

Gate: an uploaded image is safe to process, private, retrievable and reusable in a chapter.

## S07 — Build covers and illustrations

1. Add image generation jobs using the shared operation and credit patterns.
2. Store artwork independently of editable text overlays.
3. Build concept generation, history/selection, typography and positioning controls.
4. Add consistent book-level art direction and interior image insertion.
5. Compose high-resolution cover outputs with approved fonts.
6. Verify persistence, credit settlement, regeneration failures and multilingual title rendering.

Gate: a user can create and reopen a cover, change text without regenerating art, and export the composed result.

## S08 — Design interiors and preview reading

1. Add versioned template definitions and separate digital/print design profiles.
2. Introduce a shared normalized book-rendering model for preview and export.
3. Build template previews, typography/layout controls and reversible application.
4. Add front/back matter editing and responsive reader/print previews.
5. Approve font licenses, language coverage and fallback behavior.
6. Test Bengali conjuncts, mixed scripts, Arabic direction, CJK wrapping and long tables.

Gate: saved design is reproducible; reflowable previews do not pretend to have fixed print pagination.

## S09 — Review quality and consistency

1. Define versioned reports, findings, stable anchors, severity and review status.
2. Implement deterministic checks before AI-assisted review.
3. Add persistent voice/terminology context and source-aware evidence warnings.
4. Build report navigation, stale-report indicators and user review controls.
5. Make fixes explicit edits that participate in normal history/OCC.
6. Evaluate against fixtures containing known defects and misleading claims.

Gate: findings are actionable and correctly located; unverified facts and citations require human review.

## S10 — Deliver validated files

1. Snapshot manuscript, design, metadata and assets at export request time.
2. Refactor PDF generation behind a renderer registry, preserving current output.
3. Add EPUB and DOCX renderers and format-specific validators.
4. Implement private file availability checks and coherent export status/history.
5. Add format/options selection, preview links and validation diagnostics.
6. Download and open representative outputs in actual readers/editors; test failure and missing storage.

Gate: PDF, EPUB and DOCX files validate, download and open; no invalid artifact receives a successful ready state.

## S11 — Import documents and support source-based writing

1. Add source/import records with provenance, content extraction state and ownership.
2. Parse permitted DOCX/PDF/notes in isolated, resource-limited jobs.
3. Preview extraction before creating chapters or changing a manuscript.
4. Add chapter-source associations, excerpts and supporting citation anchors.
5. Add source-based summaries/Q&A with visible supporting passages and abstention when support is absent.
6. Connect source findings to quality reports; harden any URL ingestion against SSRF and prompt injection.

Gate: imports are reviewable and reversible; source-based outputs point to real passages and do not fabricate references.

## S12 — Enable paid plans safely

1. Resolve provider/region/currency and publish explicit credit/entitlement rules.
2. Add catalog, subscriptions, payments, webhook inbox and entitlement records.
3. Enforce limits in APIs and process verified events idempotently.
4. Build checkout, top-ups, payment pending/failure and cancellation management.
5. Reconcile provider state with local records and preserve financial auditability.
6. Test duplicate/out-of-order events, concurrent spend, renewal, refund and failed payment.

Gate: only verified payment state grants entitlements; customer credit balances reconcile.

## S13 — Operate and administer the product

1. Define roles and least-privilege admin permissions; audit privileged actions.
2. Add job/delivery/usage/credit/payment operational views and intervention rules.
3. Add metrics, alerts and accessible support feedback with correlation IDs.
4. Implement database plus asset backups and documented restoration.
5. Build admin UI and permission-denied states; restrict sensitive payload visibility.
6. Demonstrate alert receipt, unauthorized access rejection and a complete restore exercise.

Gate: an operator can diagnose a failed customer workflow and recover without unaudited edits.

## S14 — Prepare distribution packages

1. Review and version official destination requirements.
2. Add separate destination profiles for KDP eBook/print, Apple Books, Etsy, Gumroad and own website.
3. Assemble validated artifacts, metadata and checklists from a fixed snapshot.
4. Add package preview/download and user-managed publishing status.
5. Test contents, required metadata, stale inputs and cross-owner downloads.

Gate: downloaded packages match the chosen destination; the UI makes no unsupported direct-publishing claim.

## S15 — Create editable launch materials

1. Define typed marketing outputs and generation input snapshots.
2. Generate descriptions, bios, summaries, keywords, email drafts, captions, carousel text and video scripts.
3. Build variant preview/edit/save/copy/download with explicit credit estimates.
4. Add promotional graphic compositions using the private asset pipeline.
5. Link sample chapters to exported manuscript versions and check claims against book context.
6. Test persistence, stale inputs, cancelled jobs, inaccessible assets and no automatic external posting.

Gate: outputs remain editable, reflect the actual book and do not invent endorsements or results.

## S16 — Validate and release

1. Run the acceptance matrix against the release build in staging.
2. Validate actual OpenAI outputs/costs separately from deterministic mocks.
3. Complete security/accessibility reviews, responsive checks and measured load tests.
4. Rehearse migrations, restore, rollback and worker recovery with representative data.
5. Verify alerts, privacy/retention controls, payment settings and deployed email behavior.
6. Record evidence, remaining limitations and release approval; deploy only with required gates satisfied.

Gate: the complete workflow meets [ACCEPTANCE.md](./ACCEPTANCE.md); failed critical checks block release.

## Handoff record for each step

Copy this into a work item or release record:

```text
Step ID and outcome:
Status: planned | implementing | validating | complete | blocked
Dependencies satisfied:
Shared contract changes:
Migration/backfill and rollback:
Backend files/services:
Frontend routes/components:
Acceptance scenarios and test results:
Manual review artifacts:
Operational metrics/runbook:
Known limitations and unresolved decisions:
Evidence date/environment/commit:
```

Mark a step complete only when both implementation and its gate pass. An unresolved external prerequisite may block that step; document it and continue only independent work.
