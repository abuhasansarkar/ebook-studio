# eBookStudio implementation roadmap

Updated: 20 November 2026.

This is the implementation plan for the recommendations accepted in this conversation. It replaces the earlier M1–M7 grouping with sixteen ordered steps shared by the backend and frontend plans. These documents are specifications and checklists; unchecked work is not implemented.

## Current checkpoint

S01 is verified. S02 edit protection is implemented with browser verification; remaining resilience scenarios are recorded in ACCEPTANCE.md. Initial S14 marketplace checks are implemented, while full packaging remains pending. S03 generation recovery and S04 durable OTP delivery are now implemented with verification recorded in ACCEPTANCE.md. S05 core project/library organization and safe planning history are implemented and verified locally. S06 core private images are implemented with local verification. S07–S13 and S15–S16 remain release work. The product is not yet production-ready.

The user has prioritized sale editions for Amazon KDP, Etsy and Gumroad. Follow the [marketplace release track](./MARKETPLACE_RELEASE.md) alongside the dependency order.

## Documents

- [Implementation order](./IMPLEMENTATION_ORDER.md): dependencies, ordered work packages, and completion gates.
- [Backend plan](./BACKEND.md): data models, service boundaries, API contracts, workers, migrations, and backend tasks for every step.
- [Frontend plan](./FRONTEND.md): screens, components, state management, user interactions, and frontend tasks for every step.
- [Acceptance and release checks](./ACCEPTANCE.md): failure scenarios, testing evidence, accessibility, operational checks, and launch gates.

## Product outcome

A user can turn an idea or permitted source material into an editable, designed, reviewed book; download validated files; and prepare publishing and marketing materials. Protecting the manuscript and charging correctly are part of that outcome.

“Ready” means the documented acceptance criteria have evidence. No test count, AI score, SMTP response, or generated screen guarantees a defect-free product, factual accuracy, inbox delivery, or marketplace approval.

## Existing baseline

| Area | Present now | Still required |
| --- | --- | --- |
| Foundation | Next.js/React frontend, Express MVC API, Prisma/PostgreSQL, Redis/BullMQ, Docker | Durable environment isolation, operational readiness and release evidence |
| Accounts | Better Auth, signup/login, OTP verification/reset, conditional Google provider | Delivery retries, abuse/expiry coverage, deployment verification of each configured provider |
| Gmail | SMTP configuration, required STARTTLS on 587, TLS on 465, diagnostics, sanitized delivery logs; Docker forwards settings | Durable delivery tracking and monitoring; inbox receipt is not established by SMTP acceptance |
| Books | Recoverable wizard, richer brief, project management, filtered/paginated library, archive/restore, duplication and safe outline history | Larger-account assignment UX, cross-version structural mapping and reusable brand presets |
| Writing | Outline generation/edit/approval, section-by-section provider calls, chapter persistence, progress/cancel/retry | Durable section checkpoints, exclusive claims and crash reconciliation |
| Editing | TipTap, autosave/manual save, OCC, browser recovery, stale AI suggestion guard, chapter revision history/restore | Additional resilience scenarios, draft retention/import, and richer editing |
| Commercial tools | Wallet/reservations/ledger, queued PDF rendering/validation/download | Paid entitlements, images/design, quality reports, EPUB/DOCX, imports, distribution and marketing |

Earlier session evidence: 38 backend tests passed after SMTP changes; native and Docker Gmail authentication succeeded; Gmail accepted four diagnostic templates. Previous frontend lint/type/build checks and a mock-AI browser journey through revision restore and PDF download also passed. These are historical checks, not a fresh production acceptance run.

The current browser suite uses Puppeteer. Playwright adoption is planned and must preserve existing coverage. Actual OpenAI quality/cost, payments, backup restoration, and production load still need separate evidence.

## Ordered delivery

| Step | Deliverable | Depends on | Priority |
| --- | --- | --- | --- |
| S01 | Shared contracts, environment isolation, operation tracking — implemented and verified | Existing baseline | Critical |
| S02 | Draft recovery and reliable editor saves | S01 | Critical |
| S03 | Durable generation and credit accounting — implemented, cutover checks documented | S01, S02 | Critical |
| S04 | Durable OTP delivery and account recovery — implemented, production email checks pending | S01 | Critical |
| S05 | Projects, library organization and outline history — implemented with documented limits | S02, S03 | High |
| S06 | Private asset storage and safe uploads | S01, S05 | High |
| S07 | OpenAI covers and illustrations with editable typography | S03, S06 | High |
| S08 | Design templates and multilingual reader previews | S02, S06, S07 | High |
| S09 | Quality reports and book consistency checks | S03, S05, S06, S08 | High |
| S10 | Validated PDF, EPUB and DOCX exports | S06, S08, S09 | High |
| S11 | Document imports and source-based research | S02, S03, S05, S06, S09 | High |
| S12 | Subscriptions, top-ups and entitlements | S01, S03 | Required before paid launch |
| S13 | Administration, monitoring and backup restoration | S01, S04, S12 | Required before paid launch |
| S14 | Distribution preparation packages | S07, S09, S10, S13 | Commercial expansion |
| S15 | Marketing assets and launch materials | S03, S07, S09, S14 | Commercial expansion |
| S16 | Full regression and production release | S01–S15 | Release gate |

Implement in this numeric order by default. Dependencies identify required foundations, not authorization to skip a step. Each step includes backend, frontend, and validation work before it is complete. Shared contracts are agreed first; migration/service work precedes exposing a screen that relies on it.

## Architecture decisions

Keep Next.js, Express MVC, Better Auth, PostgreSQL/Prisma, Redis/BullMQ, Docker, TipTap, and OpenAI-only AI generation. Keep expensive work in workers and domain services independent of screens. Store files privately outside database rows; use database references and explicit ownership.

Use `packages/shared` for request/response validation, operation states, capability flags, and credit estimates. Keep secrets, provider calls, final pricing enforcement, ownership and authorization on the server.

Treat Bengali, English, RTL Arabic, and representative CJK content as fixtures throughout implementation. Expanding the language catalog requires checking editing, rendering, fonts, imports and every export format. Product UI translation and manuscript-language support are separate scopes.

## Decisions to resolve at the relevant step

| Decision | Resolve by | Safe planning assumption |
| --- | --- | --- |
| Draft retention and shared-device behavior | S02 | Per-user local recovery; no cross-account access; explain browser-storage limits |
| AI generation cost limits and chapter targets | S03 | Configurable budgets; model names are not fixed promises |
| Email retry/expiry policy and delivery key management | S04 | Expire pending messages with the associated OTP; never store raw codes in logs |
| Object storage and upload limits | S06 | One private storage system shared by API/workers in an environment |
| Template/font licenses and export permissions | S08 | Bundle only approved assets and preserve license evidence |
| PDF/DOCX parsing and EPUB validation packages | S10–S11 | Evaluate maintained implementations against fixtures before adoption |
| Payment provider, currency, region and subscription rules | S12 | Provider adapter and sandbox first; no invented confirmed prices/provider |
| Hosting, backup objectives and alert destination | S13 | Record explicit targets and verify recovery before release |
| Marketplace-specific specifications | S14 | Recheck official documentation during implementation; version each ruleset |

Continue independent work when a decision is pending. Do not silently invent business terms or expose an unsupported capability.

## Definition of completion for every step

- [ ] Shared contracts, migrations and ownership boundaries are defined and reviewed.
- [ ] Backend implementation handles retries, concurrency and relevant failure cases.
- [ ] Frontend controls work with loading, empty, validation, disabled, success, error and permission states.
- [ ] Existing user data and previously working routes remain usable.
- [ ] Meaningful service/API/browser checks pass; actual files or payment events are inspected where relevant.
- [ ] Mobile, keyboard, screen-reader semantics and relevant language fixtures pass.
- [ ] Monitoring, recovery, rollout and rollback instructions exist for the new behavior.
- [ ] Evidence and unresolved limitations are recorded in [ACCEPTANCE.md](./ACCEPTANCE.md).

## Scope discipline

Complete all sixteen steps for the scope described here before claiming the complete publishing workflow. Team workspaces, white-label accounts, coloring-book specialization, public API/webhooks, and direct marketplace integrations remain later releases. Do not imply direct publication, factual verification, plagiarism certification or guaranteed inbox placement without supporting capabilities and evidence.

## Current implementation checkpoint

S01 now has shared operation/error/pagination schemas, durable owner-scoped request identities, replay protection for book/outline/writing/export submission, a persisted dispatch retry queue, configuration-specific BullMQ prefixes, worker capability heartbeats, cross-process storage probes, bounded readiness, support references and a recent-activity UI. The development database migration is applied. Historical unprefixed work must be drained/reconciled during deployment; see [runtime runbook](../backend/RUNTIME.md).

S03 still owns atomic domain job/reservation/outbox transitions, orphan reconciliation, exclusive processor leases/fencing and durable section checkpoints. Uncertain S01 submissions deliberately require inspection instead of silent re-execution. Do not treat this foundation as complete generation crash recovery.

S02 is the next implementation package: browser draft recovery, explicit save controls and editor concurrency/recovery journeys. Later studios, imports, payments and publishing tools remain planned.
