# Backend development plan

Updated: 20 November 2026. Delivery order is coordinated in [README.md](./README.md).

## 1. Architecture and responsibilities

Use Express MVC with thin controllers, validated request bodies, service-owned business rules, Prisma persistence, and BullMQ workers for expensive work. Keep AI providers, credits, storage, exports, billing, and generation independent of individual screens.

Existing locations:

| Location | Responsibility |
| --- | --- |
| `backend/src/routes` | API routing and middleware composition |
| `backend/src/controllers` | HTTP inputs, responses, and status codes |
| `backend/src/services` | Domain logic and provider integrations |
| `backend/src/middleware` | Authentication, validation, rate limits, errors |
| `backend/src/queues` and `backend/src/worker.ts` | Queue producers and workers |
| `backend/prisma` | Database schema and migrations |
| `packages/shared/src` | Shared schemas, languages, statuses, and credit rules |

All application APIs use `/api/v1`. Better Auth owns `/api/v1/auth/*`. Every user resource must enforce ownership on the server, including nested resources, downloads, revisions, and soft-deleted books.

## 2. Implemented baseline

| Area | Present in code | Remaining qualification |
| --- | --- | --- |
| Infrastructure | Express, Prisma/PostgreSQL, Redis/BullMQ, Docker, structured logging | Verify production networking, recovery, monitoring, and storage topology |
| Authentication | Better Auth, email/password, email OTP, conditional Google provider | Verify all configured identity and reset flows in deployment |
| Books and projects | Book brief, library search, project create/list/delete | Extend project management, assignment, filtering, archive behavior |
| Outlines | Generation, saved versions, update, approval | Expose version browsing/restoration and strengthen concurrent updates |
| Writing | Section-by-section AI calls, chapter persistence, summaries, progress, cancel/retry | Persist completed sections so a crash does not discard a partial chapter |
| Editor | OCC saves, word counts, chapter revision list/preview/restore | Strengthen document validation and recovery behavior |
| AI assistant | Suggestion-only response, credit charge/refund | Expand actions, request replay behavior, and usage accounting |
| Credits | Signup grant, wallet, reserve/settle, immutable transaction rows | Paid entitlements, subscriptions, top-ups, detailed usage records |
| Exports | Queued PDF rendering, structural PDF validation, storage and download | EPUB, DOCX, deeper validation and deployed download checks |

Image generation, quality reports, distribution packages, marketing services, subscription payments, and administrative APIs remain planned.

## 3. M1 — Reliability and data protection

- [ ] Add an explicit environment namespace or equivalent queue isolation. Prevent local and deployed workers from consuming each other's jobs.
- [ ] Require API and workers in one environment to use compatible database and storage settings. Add readiness checks and operator guidance for local filesystem versus shared object storage.
- [ ] Persist each completed section with an explicit position, status, content, and usage record. Resume from the first incomplete section.
- [ ] Record generation inputs or a versioned input snapshot so resumed work uses the same brief and approved outline.
- [ ] Protect job creation and worker claims against concurrent requests and duplicate deliveries. A deterministic queue job ID alone does not establish exclusive processing.
- [ ] Reconcile database job records with queue delivery failures and abandoned reservations. Define recovery for crashes between reserving credits and enqueueing work.
- [ ] Validate TipTap node types, marks, attributes, depth, and document size; reject malformed or unsafe content before persistence.
- [ ] Keep revision creation and content updates atomic. Preserve monotonic versions and reject stale edits/restores without creating history rows.
- [ ] Review autosave conflict retry behavior and ensure unresolved conflicts do not cause uncontrolled retries.
- [ ] Make AI-assistant idempotency cover the response as well as charging; concurrent replays must not repeat paid provider calls unnecessarily.
- [ ] Record provider/model/token usage consistently across writing, assistance, images, and quality jobs.

Acceptance: crash/restart tests preserve completed sections; concurrent saves produce one winner; cancelled jobs release unused credits; queue/storage isolation allows an actual PDF download from the matching API.

## 4. M2 — Project management and planning

- [ ] Add project update and book assignment/reassignment operations with ownership checks on both resources.
- [ ] Add explicit archive/restore semantics without conflating archive with deletion.
- [ ] Define pagination, search, sort, and filter contracts for books and projects.
- [ ] Extend BookBrief with optional purpose, reader age, style, point of view, terminology, sources, and brand preferences. Preserve defaults for existing briefs.
- [ ] Expose outline version list, detail, and restore operations.
- [ ] Protect outline changes and approval against stale updates. Define what happens to an approved outline when it changes.
- [ ] Reject destructive outline replacement when a manuscript exists unless an explicit preservation workflow is used.

Acceptance: a user can organize several books and restore an outline without silently deleting existing writing.

## 5. M3 — Assets, image generation, and book design

- [ ] Introduce `Asset`, `ImageGeneration`, and book design-profile records with ownership, provenance, storage keys, and timestamps.
- [ ] Add safe image uploads: size/type limits, signature validation, safe storage keys, private retrieval, and deletion rules.
- [ ] Implement OpenAI image generation behind a provider service and a dedicated job type. Keep model selection in configuration.
- [ ] Reserve credits before generating images; settle successful outputs and release unused reservations on failure or cancellation.
- [ ] Save prompts, style settings, dimensions, model, cost/usage where available, and generated asset references.
- [ ] Generate cover artwork without title text. Store title, subtitle, author typography, colors, and positioning separately.
- [ ] Support book-level illustration style, palette, character descriptions, and aspect ratio.
- [ ] Persist separate digital/reflowable and print design settings: typography, trim size, margins, spacing, front/back matter, and chapter openings.
- [ ] Add template definitions and versioning. Snapshot applied design settings so future template edits do not alter existing books unexpectedly.

Acceptance: a cover can be regenerated, selected from history, retrieved privately, and composed with editable typography; export rendering can consume the saved design profile.

## 6. M4 — Quality checker and exports

### Quality reports

- [ ] Store report status, manuscript version/fingerprint, checker version, category results, and findings.
- [ ] Start with deterministic checks: empty chapters, heading structure, missing metadata, broken links/assets, duplicate passages, and missing image alt text.
- [ ] Add AI-assisted clarity, repetition, terminology, and contradiction review with chapter/section references.
- [ ] Mark unsupported facts and citations as requiring human review. Do not invent verification or present a score as a guarantee.
- [ ] Mark a report stale when its manuscript or relevant assets change.

### Export pipeline

- [ ] Generalize the export service from PDF to a format registry with shared book-document input and format-specific renderers.
- [ ] Freeze the manuscript/design/asset versions used by an export so the file represents a coherent snapshot.
- [ ] Expand PDF checks for links, navigation, fonts, images, margins, and separate digital/print requirements. Structural validation alone does not establish print readiness.
- [ ] Build EPUB with package metadata, navigation, valid XHTML/CSS, cover, and correct asset references. Add a maintained EPUB validation tool and persist its findings.
- [ ] Build DOCX with editable headings, paragraph styles, lists, tables, images, hyperlinks, and page breaks. Reopen the generated archive and inspect required parts and relationships.
- [ ] Test multilingual fonts, RTL direction, long tables, large images, and unsupported characters in each format.
- [ ] Verify upload completion and file availability before reporting `ready`; return the correct MIME type and filename for each format.
- [ ] Define recoverable failure behavior if a previously ready file is missing or inaccessible.

Acceptance: all three formats are generated, validated, stored, downloaded, and opened in representative readers; invalid files remain failed with actionable diagnostics.

## 7. M5 — Distribution and marketing

- [ ] Add distribution-package records with destination, input snapshot, metadata, checklist, generation status, and storage reference.
- [ ] Assemble Amazon KDP eBook and print packages separately; add Apple Books, Etsy, Gumroad, and own-website preparation profiles.
- [ ] Verify current marketplace specifications from official documentation when implementing each profile. Version destination rules and record the review date.
- [ ] Generate ZIP packages containing selected exports, cover assets, metadata, listing text, and human publishing instructions.
- [ ] Track user-entered publishing status without claiming an external platform confirmed publication.
- [ ] Add marketing assets for descriptions, summaries, keywords, author bios, emails, captions, carousel text, and short-video scripts.
- [ ] Preserve generated variants and user edits. Use book content as context and avoid fabricated reviews, quotations, or performance claims.

Acceptance: package contents match the selected destination and can be downloaded; no API claims direct publishing without an implemented integration.

## 8. M6 — Billing and administration

- [ ] Select the payment provider and define supported currencies, countries, taxes, cancellations, and refunds before implementation.
- [ ] Add plans, subscriptions, payment events, entitlements, and top-up purchases. Keep prices and allowances configurable.
- [ ] Verify webhook signatures and persist unique event IDs before applying changes transactionally.
- [ ] Define credit lifecycle rules for upgrades, renewals, failures, cancellations, refunds, and any expiration policy.
- [ ] Enforce paid feature access and quotas on the API; never accept a client-supplied wallet balance or payment success flag.
- [ ] Add explicit roles/permissions and immutable administrative audit records.
- [ ] Build admin APIs for users, books, subscriptions, transactions, credit adjustments, AI usage, jobs, templates, and reports.
- [ ] Require a reason and idempotency key for administrative credit changes; audit actor, target, action, and outcome.

Acceptance: duplicate and out-of-order payment events cannot duplicate credits or incorrectly grant access; non-admin users cannot execute privileged operations.

## 9. Proposed API additions

These are proposed contracts, not existing endpoints. Confirm request/response schemas in `packages/shared` during each milestone.

| Area | Proposed endpoints |
| --- | --- |
| Projects | `PATCH /projects/:projectId`, `PATCH /books/:bookId/project`, archive/restore actions |
| Outline history | `GET /books/:bookId/outlines`, `GET /books/:bookId/outlines/:outlineId`, restore action |
| Assets | `POST /books/:bookId/assets`, `GET /books/:bookId/assets`, `DELETE /assets/:assetId` |
| Images | `POST /books/:bookId/images/generate`, image job status and history |
| Design | `GET/PUT /books/:bookId/design`, `GET /templates` |
| Quality | `POST /books/:bookId/quality-reports`, list/detail report endpoints |
| Distribution | `POST/GET /books/:bookId/distribution-packages`, package download |
| Marketing | `POST/GET /books/:bookId/marketing-assets`, update individual asset |
| Billing | Plan catalog, checkout, billing portal, verified provider webhook |
| Admin | Role-protected `/admin/*` resource and audit endpoints |

Use durable job IDs and status responses for expensive operations. Define pagination and consistent validation, insufficient-credit, conflict, permission, and retryable error responses.

## 10. M7 — Security, operations, and release evidence

- [ ] Review session security, CSRF/origin behavior, CORS, rate limits, request limits, and privilege boundaries.
- [ ] Protect URL-based research imports against SSRF before enabling them; sanitize imported document content.
- [ ] Keep production secrets out of responses, logs, fixtures, source control, and generated artifacts.
- [ ] Add readiness checks, job failure metrics, queue age, AI latency/spend, export failures, and alert routing.
- [ ] Establish database and asset backups, retention rules, and a tested restore procedure.
- [ ] Add migration deployment/rollback guidance, worker shutdown behavior, and incident runbooks.
- [ ] Load-test representative book sizes and simultaneous generation, editing, and export workloads.

Verification commands currently available:

```sh
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter backend build
```

The backend test suite requires local PostgreSQL and Redis access. Keep its database and queue separate from development. Add focused integration tests for the failure modes introduced by each milestone, including ownership, duplicate requests, crashes, retries, billing replay, and real file downloads.

## 11. Later releases

After launch essentials: source-based research with supporting passages, a persistent book consistency engine, advanced coloring/workbook generation, team/client workspaces, API/webhooks, white-label accounts, and supported marketplace integrations. Model permissions and provenance before introducing shared workspaces or research ingestion.
