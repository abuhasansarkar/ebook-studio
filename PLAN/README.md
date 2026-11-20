# eBookStudio implementation plan

Updated: 20 November 2026.

These plans translate the supplied product roadmap into work for the existing repository. They describe implemented functionality separately from remaining work. An implemented screen or service is not a production-readiness claim.

- [Backend plan](./BACKEND.md): services, database, APIs, queues, billing, security, and operations.
- [Frontend plan](./FRONTEND.md): application routes, user journeys, editor, studios, accessibility, and browser testing.

## Product objective

Support the complete workflow: idea → brief → approved outline → manuscript → editing → design → quality review → validated export → distribution preparation → marketing.

Keep the established stack: Next.js and React, Express MVC, Better Auth, PostgreSQL and Prisma, Redis and BullMQ, Docker, and OpenAI for AI generation. Share validation contracts through `packages/shared`.

## Current baseline

The repository contains authentication and email verification, a dashboard and book library, a creation wizard, outline editing and approval, background chapter generation, credits, a TipTap editor with autosave and conflict handling, chapter revision history, and PDF export. Project CRUD exists in the API; a dedicated project management screen remains planned.

Previous verification in this session passed 27 backend tests, TypeScript checks, frontend lint, backend and frontend production builds, and a mock-AI browser journey including revision restore and PDF download. This does not verify real-provider output quality, configured Google OAuth, subscription payments, disaster recovery, or production deployment.

The current browser suite uses Puppeteer. Migrating or extending coverage with Playwright is planned; Playwright coverage must not be reported as already implemented.

## Coordinated delivery order

| Milestone | Backend deliverable | Frontend deliverable | Exit condition |
| --- | --- | --- | --- |
| M1 — Core reliability | Durable section progress, queue isolation, job reconciliation, revision safety | Unsaved-draft recovery, save controls, reliable conflict and generation states | Interrupt, resume, and concurrent-edit journeys preserve completed work and credits |
| M2 — Projects and planning | Project updates, book assignment, archive/filter APIs, outline version access | Projects screen, richer brief, outline version browser | Users organize multiple books and recover an earlier outline |
| M3 — Images and design | Assets, uploads, OpenAI image jobs, design profiles | Image studio, editable cover typography, templates and reader preview | Cover artwork and design settings persist and appear in previews |
| M4 — Quality and exports | Quality reports, EPUB/DOCX renderers and validation | Quality checker, report navigation, format selection and export history | PDF, EPUB, and DOCX files open correctly and pass format-specific checks |
| M5 — Distribution and marketing | Package assembly, platform metadata, marketing jobs | Distribution center, editable marketing assets and downloads | A publishing package contains the chosen manuscript, cover, metadata, and checklist |
| M6 — Billing and administration | Provider webhooks, entitlements, role checks, audit logs | Billing flows, plan limits, administrative screens | Payment events update entitlements once; privileged actions are authorized and audited |
| M7 — Launch validation | Backups, monitoring, load/security checks and deployment runbooks | Accessibility, responsive and full browser regression | Launch checklist has evidence for every required item |

Complete a usable backend/frontend slice for each milestone before expanding to the next. Billing provider selection, commercial plan allowances, and deployment targets remain product decisions; do not invent confirmed providers or prices.

## Shared delivery rules

1. Define or update the shared schema, status values, credit estimate, and error contract before wiring a new action.
2. Add database migrations and ownership checks before exposing persisted resources.
3. Perform expensive generation in workers; expose durable job status to the UI.
4. Charge credits on the server and show the estimated cost before submission.
5. Provide working controls with loading, empty, validation, success, error, and permission states.
6. Validate the actual exported file before marking an export ready.
7. Treat marketplace publishing as preparation until a supported direct integration exists.
8. Use mock AI for routine tests; separately validate real OpenAI behavior and costs before launch.

## Environment and verification notes

- Separate local, test, staging, and production queues. API and worker instances consuming the same queue must share the same database and asset storage configuration.
- Browser testing exposed a ready export whose file was absent from the local API storage. An isolated local queue allowed the complete test to pass. Add durable environment isolation and shared-storage checks to M1.
- A sandbox port-permission error persisted in the Turbopack build cache. A fresh build cache restored successful builds; keep this as a troubleshooting note, not a normal build step.
- Tests must wait for the editor's actual saved state before navigating. Matching the word “Saved” in manuscript text can falsely indicate that autosave finished.

## Launch acceptance

- [ ] Registration, verification, login, reset, expiry, and access control work in the deployed environment.
- [ ] A user can create, plan, generate, edit, design, review, and export a book without losing work.
- [ ] Cancellation, retries, worker restarts, and duplicate events do not duplicate charges.
- [ ] Concurrent edits and restores surface conflicts and preserve recoverable drafts.
- [ ] Generated and uploaded assets are private, retrievable, and included correctly in exports.
- [ ] PDF, EPUB, and DOCX validation and downloads pass in the deployed environment.
- [ ] Distribution and marketing outputs accurately describe supported capabilities.
- [ ] Paid plans, top-ups, entitlements, and webhook replay handling are verified.
- [ ] Admin permissions, audit history, monitoring, and alert delivery are verified.
- [ ] Backup restoration, security, accessibility, mobile usability, and performance checks pass.

Keep release evidence with the milestone: checks run, environments used, limitations, and unresolved blockers. Update these plans as work ships.
