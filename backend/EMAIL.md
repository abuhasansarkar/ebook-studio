# OTP email setup and checks

The backend sends six-digit codes for email verification, OTP sign-in, password reset, and the change-email template. Change-email UI/API enablement is separate from having an email template.

## Gmail configuration

Set these in the root `.env` (never commit actual credentials):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-address@gmail.com
SMTP_PASS="your-google-app-password"
SMTP_FROM="eBookStudio <your-address@gmail.com>"
```

Port 587 uses required STARTTLS; port 465 uses implicit TLS. Use a Google App Password, not your normal account password. Spaces in Gmail App Passwords are normalized by the sender. Match the sender address to the authenticated account or a configured sending alias. See [Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail).

Docker now forwards SMTP host, port, user, password, and sender from `.env`. Recreate services after changing environment settings:

```sh
docker compose up -d --build backend worker
```

Restart native backend processes after editing `.env` as well.

## Live diagnostics

From the repository root:

```sh
# Verify connection, TLS, and authentication without sending email.
pnpm --filter backend email:check

# Send each of the four templates to SMTP_USER itself.
pnpm --filter backend email:check --send-test
```

The diagnostic does not print credentials or codes. Its generated codes are test messages, not valid account authentication tokens. SMTP acceptance proves that the server accepted a message; check Inbox/Spam to confirm actual receipt.

## Delivery and authentication behavior

- Codes expire after ten minutes; Better Auth stores hashed OTPs and limits verification attempts.
- The auth callback persists an encrypted delivery record, then dispatches without blocking the auth response on SMTP. The transport checks rejected recipients and uses network timeouts.
- Delivery failures log the operation type and safe SMTP error codes without credentials, recipients, or OTP values.
- Better Auth catches email callback errors and returns neutral authentication responses. An HTTP 200 by itself is not delivery confirmation; inspect the sanitized mailer logs and use the live diagnostic.
- Durable retries are implemented below. Production alert delivery and real inbox verification remain release checks; SMTP acceptance is not inbox delivery.

## Automated tests

```sh
pnpm --filter backend test
```

Tests capture email instead of connecting to Gmail. Coverage includes all four templates, SMTP TLS options, rejected delivery, signup/resend verification, invalid/reused codes, OTP sign-in sessions, password reset and reuse rejection, and neutral responses for unknown accounts or SMTP failures.

For Mailpit development, use `SMTP_HOST=localhost` for a native backend or `SMTP_HOST=mailpit` for Docker, port `1025`, and empty SMTP credentials. The browser suite reads OTPs from Mailpit; use a separate test environment rather than running that suite against real Gmail settings.


## Durable OTP delivery (S04)

Apply `20261120150000_email_delivery` before starting the updated API and worker. Both processes run a five-second dispatcher; atomic leases prevent normal concurrent duplicate dispatch. Eligibility is checked against the current Better Auth verification row immediately before sending: missing/consumed, expired, superseded and attempt-exhausted codes are discarded. This adapter is pinned by integration tests to Better Auth 1.7's hashed OTP representation; rerun these tests before upgrading auth dependencies.

Recipient/code/type are encrypted with AES-256-GCM and a key derived from `BETTER_AUTH_SECRET` using a dedicated label. The verification ID is authenticated as associated data. Logs contain only delivery IDs, type and classified failure codes. Runtime matching includes database, namespace and SMTP configuration so Mailpit and Gmail cannot consume each other's delivery records.

Transient failures retry at bounded exponential delays, up to five attempts within the original token lifetime. SMTP authentication/5xx errors terminate the delivery; request a fresh code after fixing configuration. No operator action should reset expiry or revive a consumed/superseded code. Payloads are erased on acceptance, terminal failure, supersession or expiry; terminal metadata is removed after 14 days. Cleanup runs while an API/worker is active and on restart, not while all processes are offline.

```sh
# Read-only counts by status/type and age of oldest pending delivery; no recipients/codes.
pnpm --filter backend email:status
```

Secret or SMTP configuration rotation changes the delivery runtime identity. Existing pending deliveries cannot be picked up under the new identity; request fresh codes and let expired ciphertext be cleaned up. Deploy configuration changes consistently across API and worker.

SMTP is not transactional with PostgreSQL. A crash after SMTP acceptance but before recording acceptance can cause a duplicate message with the same code. A code revoked while SMTP is in flight remains invalid even if that message arrives. A process failure between Better Auth creating a verification and the callback persisting its delivery still requires a user resend. Neither HTTP success nor `accepted` status certifies inbox receipt.

The diagnostic `email:check --send-test` intentionally bypasses the outbox and uses non-account codes. It remains restricted to the configured SMTP account. Automated tests inject captured transports; browser tests use Mailpit, never Gmail.
