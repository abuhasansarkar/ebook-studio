# eBookStudio API — Postman collection

A Postman collection covering **every endpoint of the eBookStudio backend**, with
the use case each one serves and the guard that enforces it.

- `ebook-studio-api.postman_collection.json` — the collection (22 groups, 160 endpoints).
- `build-collection.mjs` — the generator that produces it.

## Why it is generated

The collection is generated from a script rather than hand-written, so it can be
regenerated after a route changes and reviewed as a diff:

```
node api/postman/build-collection.mjs
```

Every endpoint in it was read from the backend source — the routers in
`backend/src/routes/`, the controllers in `backend/src/controllers/`, and the
request schemas in `packages/shared/src/`. The descriptions carry the customer
use case and the server-side guard (permission, rate limit, credit cost,
optimistic-concurrency check), because a collection that only lists paths and
methods does not tell you what a call is allowed to do.

## Coverage

| Group | Endpoints | Area |
|---|---|---|
| 00 | 4 | Health and public config |
| 01 | 9 | Authentication (Better Auth) |
| 02 | 7 | Account, credits, projects |
| 03 | 7 | Books and library |
| 04 | 6 | Outline |
| 05 | 4 | Generation (chapters) |
| 06 | 7 | Chapters and editor |
| 07 | 10 | Quality review |
| 08 | 9 | Interior design |
| 09 | 8 | Cover studio and image generation |
| 10 | 5 | Image library (assets) |
| 11 | 15 | Sources, research and citations |
| 12 | 5 | Exports |
| 13 | 7 | Distribution packages |
| 14 | 7 | Store listing copy |
| 15 | 13 | Marketing studio |
| 16 | 1 | Publishing checks |
| 17 | 2 | Support center (customer) |
| 18 | 2 | Operations (author-visible) |
| 19 | 24 | Administration |
| 20 | 6 | Billing |
| 21 | 2 | Local payment provider (test only) |

The backend registers **147 Express routes** across 12 routers. The collection
holds those 147 plus the 9 Better Auth routes it serves and 4 routes registered
across multiple lines — 160 in all. Every source route appears in the collection;
the collection invents no route.

## Getting started

1. Set the `baseUrl` variable to your API host. The default is
   `http://localhost:4000`.
2. Sign up, then verify the email with the six digit code. The session cookie is
   set on the response, and Postman keeps it.
3. Create a book, approve its outline, then start writing. The `{{bookId}}`,
   `{{chapterId}}` and `{{jobId}}` variables are filled in from the responses
   as you go.

### Authentication

The API is session based: send the session cookie. The protected requests also
carry `Authorization: Bearer {{accessToken}}`, so a token based setup works
without editing the collection.

### The codes you will see

| Code | Meaning |
|---|---|
| 200 / 201 | It worked. `201` means something was created. |
| 204 | It worked and there is no body to return. |
| 400 | The body or query failed validation. `details` names the field. |
| 401 | No session, or the email is not verified. |
| 402 | Not enough credits. |
| 403 | The account lacks the permission, or a plan quota is reached. |
| 404 | The resource does not exist, or belongs to another author. |
| 409 | A concurrent edit. The `details` carry the current version. |
| 429 | Rate limited. Slow down and retry. |
| 503 | The server is degraded — a dependency is down. |

Every error body is `{ "error": { "code", "message", "details" } }` and carries
an `x-request-id` header that matches the server log line.

## The boundary the product keeps

Nothing in this API publishes, emails or posts on an author's behalf.

- The distribution routes assemble a ZIP the author downloads and uploads to a
  store themselves. They never call a store API.
- The publishing status is the author's own record of what they did with a
  store. Only the author knows whether a store accepted the book.
- The marketing routes produce files — drafts, graphics, sample packs — that the
  author downloads and uses. No route sends an email or posts to a social
  network.
- The `billing/webhook` route is the one place credits are granted, and only
  from a signature-verified `payment.succeeded` event.

## Groups that need a special account

**Administration (group 19)** — every route checks a permission on the server,
so an operator who navigates straight to a route they have no permission for is
refused with a 403 naming the missing permission. The roles are:

| Role | Permissions |
|---|---|
| `support` | `ops.read`, `users.manage`, `deliveries.read`, `support.reply` |
| `finance` | `ops.read`, `billing.read`, `billing.refund`, `credits.adjust`, `audit.read` |
| `administrator` | everything |

**Local payment provider (group 21)** — stands in for a payment processor so
the merchant side can be exercised end to end. It is reachable only when the
build talks to the local provider; in a build with a live provider these routes
return 404, which is their own documented behaviour.

## Files

| Path | What it is |
|---|---|
| `api/postman/ebook-studio-api.postman_collection.json` | The collection |
| `api/postman/build-collection.mjs` | The generator |
| `api/postman/README.md` | This file |
