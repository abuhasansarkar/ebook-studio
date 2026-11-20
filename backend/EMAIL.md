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
- The sender waits for SMTP acceptance, checks rejected recipients, and uses bounded network timeouts.
- Delivery failures log the operation type and safe SMTP error codes without credentials, recipients, or OTP values.
- Better Auth catches email callback errors and returns neutral authentication responses. An HTTP 200 by itself is not delivery confirmation; inspect the sanitized mailer logs and use the live diagnostic.
- Production delivery monitoring and durable retries are separate follow-up work. SMTP and inbox delivery cannot be guaranteed under every provider or network failure.

## Automated tests

```sh
pnpm --filter backend test
```

Tests capture email instead of connecting to Gmail. Coverage includes all four templates, SMTP TLS options, rejected delivery, signup/resend verification, invalid/reused codes, OTP sign-in sessions, password reset and reuse rejection, and neutral responses for unknown accounts or SMTP failures.

For Mailpit development, use `SMTP_HOST=localhost` for a native backend or `SMTP_HOST=mailpit` for Docker, port `1025`, and empty SMTP credentials. The browser suite reads OTPs from Mailpit; use a separate test environment rather than running that suite against real Gmail settings.
