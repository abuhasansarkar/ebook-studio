# Load budgets

## Measured budgets — 21 November 2026

These are the budgets the load test held itself to. They were written down before the run.

| Measure | Budget |
| --- | --- |
| Concurrent readers on one book | 25 |
| Concurrent writers saving at once | 8 |
| Read p95 | 250 ms |
| Save p95 | 1000 ms |
| Editor open p95 | 1500 ms |
| Process memory growth over the run | 250 MB |
| Queue age before the queue is called unhealthy | 15 min |

## Measured results — 21 November 2026

Measured against a local stack and a local database, so these are a floor and not a capacity claim.

| Measure | Budget | Measured |
| --- | --- | --- |
| Concurrent readers on one book | 25 | 25, all 200 |
| Read p50 / p95 / max | — | 100 ms / 107 ms / 107 ms |
| Total wall time for 25 concurrent reads | — | 107 ms |
| Concurrent writers saving at once | 8 | 8, all 200 |
| Save p50 / p95 / max | 1000 ms p95 | 86 ms / 128 ms / 128 ms |
| Editor open p50 / p95 | 1500 ms p95 | 38 ms / 41 ms |
| Process memory growth over the run | 250 MB | +12.4 MB |
| Jobs this run started that failed | 0 | 0 of 1 |

### The book under test

8 chapters, about 1,200 words each, about 57,600 characters in the manuscript.

### What this does not establish

- **This is a single-process, single-machine run against a local database.** It says nothing about how the product behaves behind a load balancer, with several application instances, or against a managed database with real network latency.
- **The reads were of one book's chapter list.** The heaviest read in the product is the reader view of a whole book, which was not measured here.
- **The saves were of eight different chapters.** Eight writers saving the *same* chapter is a different contention pattern: every one of them would collide on the same row and the optimistic-concurrency check would reject all but one. That case is covered by the concurrency tests in `api.test.ts`, but its timing was not measured here.
- **The queue-age figure is the limit the product enforces, not a measured queue age.** No long-running job was created, because the AI provider was mocked and the jobs finish in milliseconds. The limit itself is asserted; the behaviour under a genuinely backed-up queue is unmeasured.
- **The memory figure is the Node process heap in a test runner.** It is not the server's resident set, and it says nothing about the memory a long-lived server accumulates over days.
- **No load was applied to the AI provider.** Every generation in this run was mocked, so no provider rate limit, no provider latency and no provider cost under concurrency was observed.
