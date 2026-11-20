# Queue isolation, operations and readiness

## Configuration

API and worker must share `QUEUE_NAMESPACE`, database URL, storage configuration, authentication secret, AI mode and model configuration. Native development defaults to namespace `development`; Docker Compose defaults to `docker-local`; backend tests force `test` and an isolated Redis database.

Each queue prefix includes a keyed configuration digest. Differently configured consumers cannot take jobs from the same prefix. The digest contains no readable credentials. Model/mock-mode changes, secret rotation, database URL changes or storage changes create a new prefix: drain existing work before changing these settings, or explicitly reconcile old jobs and their credit reservations. Equivalent database aliases with different URLs are intentionally treated as different configurations.

API and workers using local storage must share actual files, not only matching directory names. Workers publish a fresh expiring Redis heartbeat with capabilities and a random private storage probe; API readiness reads that artifact to prove visibility. On normal shutdown the worker removes its probe. Crash leftovers are not customer assets; include `runtime-probes/` in operational retention cleanup.

## Health endpoints

- `GET /api/v1/health/live`: process liveness only.
- `GET /api/v1/health`: existing database/Redis dependency check; retained for startup and Compose dependency compatibility.
- `GET /api/v1/health/ready`: bounded check of database, Redis, worker capabilities and readable worker storage; returns 503 if required checks fail. No connection strings, probe keys or digests appear in the response.

Do not make the API startup dependency wait for worker readiness when worker startup already depends on the API's basic health check. Use readiness for traffic admission after both services have started.

New outline, writing and export submissions check readiness before creating their job/reservation. Service tests execute processors inline and test readiness separately with real Redis/heartbeat/storage fixtures.

## Request identity and activity

Book creation, outline generation, chapter generation and PDF export accept `Idempotency-Key` (1–100 letters/numbers/underscore/hyphen). The UI retains a key across uncertain responses in session storage; it stores a payload digest, not manuscript text. Successful responses include `operationId`; application errors include a bounded support request ID. Old clients without a key still work but cannot replay a submission by that identity.

The durable identity is scoped to the authenticated owner and normalized request inputs. An identical key/input replays the stored submission response; a changed input using the same key returns 409. Concurrent/incomplete requests return `OPERATION_PENDING`. A process failure with uncertain domain effects is marked `needs_review` and must not be silently executed again.

- `GET /api/v1/operations/:operationId` returns owner-scoped status projected from current generation/export state.
- `GET /api/v1/books/:bookId/operations?limit=20&cursor=...` returns recent activity with bounded pagination.
- Deleted or foreign books/operations are inaccessible.

The generation/export screens show recent activity and copyable support references. `needs_review` means an operator must inspect the existing job/book/ledger before deciding whether a fresh request is safe. There is no automatic administrative repair endpoint in S01.

## Durable dispatch and rollout limits

Dispatch intents are persisted in `queue_dispatches` before Redis enqueueing. API and worker dispatcher loops retry pending intents in the matching namespace/configuration. A bounded Redis wait lets the HTTP submission return without losing the persisted dispatch. Replaying a dispatch uses the same queue job ID.

This establishes durable dispatch identity; it does not yet close every domain transaction gap. Generation job creation, reservation and outbox insertion currently have separate boundaries. S03 must make those transitions coherent, add orphan-reservation reconciliation, exclusive processor leases/fencing and section checkpoints. Do not claim exactly-once provider calls or complete crash recovery based on S01 alone.

Existing queue records use the old unprefixed names. They are not automatically moved because a legacy worker may still own them. Before deployment: inventory old queued/running jobs, stop new submissions during cutover if needed, drain old compatible workers, apply the additive migration, then start new API/workers and confirm readiness. Retain backward-compatible tables until existing work is reconciled.

## Verification

Run backend tests with isolated PostgreSQL/Redis; regular tests capture email and mock AI. The S01 suite covers real queue-prefix isolation, unreadable/missing worker probes, concurrent/replayed/uncertain requests, simulated broker failure and actual validated PDF download from worker-visible storage.

Browser validation should use a release frontend and a dedicated Mailpit/mock-AI API/worker environment. Do not run the Mailpit OTP journey against live Gmail settings.

## Generation protocol 2 (S03)

The additive `20261120143000_generation_checkpoints` migration adds immutable job inputs, expiring worker ownership and section checkpoints. Protocol 2 changes the queue fingerprint: drain protocol-1 workers and deliveries before deploying the new API/worker pair. Do not run old and new producers against the same books during cutover. Back up database and storage first. New columns/tables can remain during a code rollback, but protocol-2 work must be drained or reconciled before an older worker is started.

Outline and chapter job creation, credit reservation, and dispatch insertion now commit together. Book-row locking serializes starts and planning mutations. A worker must own an unexpired token before every checkpoint, chapter commit or terminal transition. Heartbeats renew the 120-second lease every 30 seconds; an expired token cannot be revived. Chapter completion, its immutable revision, progress and credit consumption are atomic. Terminal status and credit settlement are also atomic.

Written sections and chapter summaries resume from the same job's fixed inputs after an interrupted worker. A stopped or failed job is terminal; explicit Retry starts a new job for unfinished chapters. Previously completed chapters are preserved. Current pricing remains per completed chapter; incomplete sections do not charge the customer's reserved credits.

The dispatcher reconciles matching-protocol generation records whose delivery was lost or became terminal in Redis while the database job remained active. It does not remove active queue deliveries; BullMQ's stalled-job recovery must first release those. Recovery can take longer than a lease interval. A provider request that finishes before its checkpoint is committed may be repeated after a crash; customer commit/charge fencing does not promise exactly-once provider billing.

Run the read-only audit before cutover and after restoration:

```sh
pnpm --filter backend generation:audit
```

It reports wallet reserved-balance mismatches, missing reservation records, unsettled terminal jobs and legacy active jobs without snapshots. A nonzero exit blocks automatic cutover. Investigate these records; do not infer refunds from Redis queue absence. Valid protocol-2 jobs reconcile automatically, but historical ledger repair requires explicit operator review. Operation request records can still enter `needs_review` if a process dies between committing a domain job and saving its HTTP replay response; they must not be blindly rerun.
