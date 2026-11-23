/**
 * End-to-end journey for the account, payment-history and service-status
 * surfaces (run against a live stack):
 *
 *   sign up → verify OTP (via Mailpit) → account record → payments history →
 *   sign in as an operator → service status → profile rename → sign out.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025
 *   OPERATOR_EMAIL=... pnpm e2e:account
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/ebook-e2e";
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-account-${Date.now()}@example.com`;
const operatorEmail = process.env.OPERATOR_EMAIL;
const operatorPassword = process.env.OPERATOR_PASSWORD ?? "password123";
let step = 0;

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  if (process.env.SKIP_SCREENSHOTS === "1") return;
  // A screenshot is diagnostic evidence, not an assertion: a capture failure
  // must not abort a journey whose page state was already verified.
  try {
    await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
  } catch (error) {
    console.warn(`! screenshot "${name}" failed: ${(error as Error).message}`);
  }
}

async function waitText(page: Page, text: string, timeout = 30_000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

async function clickButton(page: Page, text: string) {
  const handle = await page.waitForSelector(
    `::-p-xpath(//button[contains(normalize-space(.), ${JSON.stringify(text)}) and not(@disabled)] | //a[contains(normalize-space(.), ${JSON.stringify(text)})])`,
    { timeout: 30_000 },
  );
  await handle!.click();
}

async function getOtp(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = (await res.json()) as { messages: { Snippet: string }[] };
    const m = data.messages[0]?.Snippet.match(/(\d{6})/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("OTP email not received");
}

const browser = await puppeteer.launch({ headless: HEADLESS, args: ["--no-sandbox"], defaultViewport: { width: 1360, height: 900 } });
const page = await browser.newPage();
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && consoleErrors.push(m.text()));

try {
  // ---- Sign up and verify -------------------------------------------------
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "Account Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await clickButton(page, "Create account");
  await page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 15_000 });

  const otp = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(otp, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  log("signed up and verified");

  // ---- The account record (GET /users/me) ---------------------------------
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
  await waitText(page, "Account");
  await page.waitForSelector('[data-testid="account-record"]', { timeout: 15_000 });
  const account = await page.evaluate(async () => {
    const response = await fetch("/api/v1/users/me", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  if (account.status !== 200) throw new Error(`GET /users/me returned ${account.status}`);
  const record = await page.$eval('[data-testid="account-record"]', (el) => el.textContent ?? "");
  if (!record.includes(account.body.user.email)) throw new Error("The account record does not show the account email");
  if (!record.includes("Verified")) throw new Error("The account record does not show the verification state");
  if (!record.includes(account.body.user.id)) throw new Error("The account record does not show the account id");
  // The editable profile is seeded from the session, so the field is not blank.
  const fieldValue = await page.$eval('[data-testid="profile-name"]', (el) => (el as HTMLInputElement).value);
  if (fieldValue !== account.body.user.name) {
    throw new Error(`The profile field shows "${fieldValue}" but the account name is "${account.body.user.name}"`);
  }
  await shot(page, "settings-account");
  log("account record reads the product's own account endpoint");

  // ---- Profile rename ------------------------------------------------------
  await page.$eval('[data-testid="profile-name"]', (el) => (el as HTMLInputElement).select());
  await page.type('[data-testid="profile-name"]', "Renamed Tester");
  await clickButton(page, "Save changes");
  await page.waitForFunction(() => document.body.innerText.includes("Profile saved"), { timeout: 15_000 });
  // The account record on the server must follow the rename.
  await page.waitForFunction(
    async (expected) => {
      const body = await (await fetch("/api/v1/users/me", { credentials: "include" })).json();
      return body.user.name === expected;
    },
    { timeout: 15_000, polling: 500 },
    "Renamed Tester",
  );
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="account-record"]')?.textContent ?? "").includes("Renamed Tester"),
    { timeout: 15_000 },
  );
  await shot(page, "settings-renamed");
  log("profile rename saves and the account record follows it");

  // ---- The payment history (GET /billing/payments) ------------------------
  await page.goto(`${BASE}/app/credits/billing`, { waitUntil: "networkidle0" });
  await waitText(page, "Payment history");
  const payments = await page.evaluate(async () => {
    const response = await fetch("/api/v1/billing/payments", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  if (payments.status !== 200) throw new Error(`GET /billing/payments returned ${payments.status}`);
  if (!Array.isArray(payments.body.payments)) throw new Error("GET /billing/payments did not return a payments list");
  if (payments.body.payments.length === 0) {
    await waitText(page, "No payments yet");
  } else {
    await page.waitForSelector('[data-testid="payment-history"]', { timeout: 15_000 });
  }
  await shot(page, "billing-payments");
  log("payment history reads the scoped payments endpoint");

  // ---- The service status (GET /health/*) ----------------------------------
  // The status panel belongs to the operations console, so the journey signs in
  // as an operator to reach it if an operator account was provided.
  if (operatorEmail) {
    await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
    await clickButton(page, "Log out");
    await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.type("#email", operatorEmail);
    await page.type("#password", operatorPassword);
    await clickButton(page, "Log in");
    await page.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 20_000 });
    log("signed in as an operator");

    await page.goto(`${BASE}/app/admin`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="admin-panel-status"]', { timeout: 20_000 });
    await clickButton(page, "Status");
    await page.waitForSelector('[data-testid="service-status"]', { timeout: 20_000 });
    await waitText(page, "Liveness");
    await waitText(page, "Readiness");
    await waitText(page, "Health");
    const statusText = await page.$eval('[data-testid="service-status"]', (el) => el.textContent ?? "");
    if (!statusText.includes("Alive")) throw new Error(`The status panel did not report liveness: ${statusText}`);
    if (!statusText.includes("Database")) throw new Error("The status panel did not name the database dependency");
    if (!statusText.includes("Workers")) throw new Error("The status panel did not name the worker dependency");
    await shot(page, "admin-status");
    log("the service status panel reports each dependency by name");

    // The probes behind the panel answer the same questions directly.
    const health = await page.evaluate(async () => {
      const [live, ready, check] = await Promise.all([
        fetch("/api/v1/health/live", { credentials: "include" }),
        fetch("/api/v1/health/ready", { credentials: "include" }),
        fetch("/api/v1/health", { credentials: "include" }),
      ]);
      return {
        live: { status: live.status, body: await live.json() },
        ready: { status: ready.status, body: await ready.json() },
        check: { status: check.status, body: await check.json() },
      };
    });
    if (health.live.status !== 200 || health.live.body.status !== "alive") {
      throw new Error(`GET /health/live returned ${health.live.status} ${JSON.stringify(health.live.body)}`);
    }
    if (health.ready.status !== 200 && health.ready.status !== 503) {
      throw new Error(`GET /health/ready returned ${health.ready.status}`);
    }
    if (health.check.status !== 200 && health.check.status !== 503) {
      throw new Error(`GET /health returned ${health.check.status}`);
    }
    log("the three health probes answer as documented");
  } else {
    console.log("ℹ OPERATOR_EMAIL not set; skipping operator-only status panel check");
  }

  // ---- Signing out ---------------------------------------------------------
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle0" });
  await clickButton(page, "Log out");
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });
  log("signing out returns to the login screen");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll steps passed. Screenshots: ${SHOTS}`);
} catch (err) {
  await shot(page, "FAILURE").catch(() => undefined);
  console.error(`\n✗ Failed at step ${step}: ${(err as Error).message}`);
  if (consoleErrors.length) console.error("Browser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
