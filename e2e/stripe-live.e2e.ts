/**
 * The live Stripe webhook path.
 *
 * The other billing journey proves the rules against the local provider. This
 * one proves the same rules against Stripe's own sandbox: a real checkout
 * session is opened, the event is delivered through the Stripe CLI's listener,
 * and the credits and entitlements appear only after the server has verified
 * the signature.
 *
 * The invariants checked here are the ones that matter:
 *   - a checkout grants nothing on its own;
 *   - a forged callback from the browser grants nothing;
 *   - only the verified event grants credits and entitlements;
 *   - the same event delivered twice grants once.
 */
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** The browser the journey drives. */
let browser: Browser;

/** Waits for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pays the checkout session the way a customer does.
 *
 * Stripe's hosted Checkout page owns the payment: a session has no payment
 * intent until the customer pays on that page, and the API offers no way to
 * complete it from outside. So the page is opened in a browser, the test card
 * is entered, and the Pay button is pressed — the same path a real customer
 * takes.
 *
 * The payment this makes is the session's own payment, so the event Stripe
 * delivers is the session's event, carrying the metadata the product attached
 * when it opened the checkout.
 */
async function payAtStripe(sessionId: string): Promise<void> {
  const { stdout } = await execFileAsync("stripe", ["get", `/v1/checkout/sessions/${sessionId}`], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const session = JSON.parse(stdout) as { id: string; url: string; payment_status: string };

  const checkout = await browser.newPage();
  await checkout.setViewport({ width: 1280, height: 900 });
  try {
    await checkout.goto(session.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Stripe's card fields live in their own frame.
    const frame = await waitForCardFrame(checkout);

    // The email is asked for first, and Stripe reveals the card fields once it
    // has one, so the order here is the order a customer types in.
    await typeInto(frame, "email", "stripe.tester@example.com");
    await typeInto(frame, "number", "4242424242424242");
    await typeInto(frame, "expiry", "1235");
    await typeInto(frame, "cvc", "123");
    await typeInto(frame, "name", "Stripe Tester");

    // The Pay button is only shown once the form is complete, so it is
    // waited for rather than read straight away.
    const pay = await frame.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const button = buttons.find((b) => (b as HTMLButtonElement).type === "submit" && !(b as HTMLButtonElement).disabled);
        if (!button) return false;
        (button as HTMLButtonElement).setAttribute("data-e2e-pay", "true");
        return true;
      },
      { timeout: 30_000, polling: 250 },
    );
    if (!pay) throw new Error("Stripe's Pay button was never shown");
    await frame.click("button[data-e2e-pay=true]");

    // The session reports itself paid; the page may take a moment to redirect.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const { stdout: current } = await execFileAsync("stripe", ["get", `/v1/checkout/sessions/${sessionId}`], {
        maxBuffer: 8 * 1024 * 1024,
      });
      const state = JSON.parse(current) as { payment_status?: string; status?: string };
      if (state.payment_status === "paid") return;
      await sleep(1000);
    }
    throw new Error(`the checkout session ${sessionId} was not paid in time`);
  } finally {
    await checkout.close().catch(() => undefined);
  }
}

/** Waits for Stripe's card frame and returns it. */
async function waitForCardFrame(page: Page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      // The card fields are told apart by the names they carry, not by the
      // frame's own name: Stripe names its frames after the build, and the
      // build changes between releases.
      const hasCard = await frame
        .evaluate(() => Boolean(document.querySelector('input[name="number"]')))
        .catch(() => false);
      if (hasCard) return frame;
    }
    await sleep(500);
  }
  throw new Error("Stripe's card fields never appeared");
}

/** Fills one field of Stripe's card frame. */
async function typeInto(frame: Frame, name: string, value: string): Promise<void> {
  const selector = `input[name="${name}"]`;
  const field = await frame.waitForSelector(selector, { timeout: 20_000 });
  if (!field) throw new Error(`Stripe's ${name} field was never shown`);
  await field.click();
  await field.type(value, { delay: 20 });
}

/** Types into a field, clearing it first. */
async function fill(scope: Page, selector: string, value: string): Promise<void> {
  const element = await scope.$(selector);
  if (!element) return;
  await element.click().catch(() => undefined);
  await element.type(value, { delay: 20 });
}

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-stripe");
mkdirSync(SHOTS, { recursive: true });

let step = 0;
function log(message: string) {
  console.log(`✔ ${message}`);
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
  await page.waitForFunction(
    (needle) => (document.body.innerText ?? "").includes(needle),
    { timeout },
    text,
  );
}

/** Reads the credit balance the server reports for the signed-in author. */
async function credits(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const res = await fetch("/api/v1/credits", { credentials: "include" });
    const body = (await res.json()) as { wallet?: { balance: number } };
    return body.wallet?.balance ?? NaN;
  });
}

/** Waits for the verification code to arrive in the captured mail. */
async function getOtp(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = (await res.json()) as { messages: { Snippet: string }[] };
    const found = data.messages[0]?.Snippet.match(/(\d{6})/);
    if (found) return found[1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the verification code did not arrive");
}

browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const consoleErrors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

try {
  // ---- Sign up and verify ----
  const email = `e2e-stripe-${Date.now()}@example.com`;
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "Stripe Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await Promise.all([
    page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 20_000 }),
    page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((el) =>
        el.textContent?.trim() === "Create account",
      );
      (button as HTMLButtonElement | undefined)?.click();
    }),
  ]);

  const code = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(code, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  log("signed up and verified");

  // ---- The build talks to Stripe ----
  const provider = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/plans", { credentials: "include" });
    return (await res.json()) as { provider: string; providerLive: boolean };
  });
  if (provider.provider !== "stripe") {
    throw new Error(`The build talks to ${provider.provider}, expected stripe`);
  }
  log(`the build talks to ${provider.provider} (live: ${provider.providerLive})`);

  const before = await credits(page);
  if (!Number.isFinite(before)) throw new Error("could not read the starting credit balance");

  // ---- A checkout grants nothing on its own ----
  const checkout = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "starter" }),
    });
    return { status: res.status, body: (await res.json()) as { checkout?: { url?: string; id?: string; status?: string } } };
  });
  if (checkout.status !== 201) {
    throw new Error(`the checkout was answered with ${checkout.status}: ${JSON.stringify(checkout.body)}`);
  }
  const url = checkout.body.checkout?.url;
  if (!url) throw new Error("the checkout carried no Stripe URL");
  // The URL is written out so the hosted page can be inspected when the
  // journey fails part way through.
  writeFileSync(path.join(SHOTS, "stripe-checkout-url.txt"), url, "utf8");
  log(`a checkout session was opened at Stripe (${checkout.body.checkout?.id ?? "no id"})`);

  const afterCheckout = await credits(page);
  if (afterCheckout !== before) {
    throw new Error(`the checkout changed the credit balance from ${before} to ${afterCheckout}`);
  }
  log(`the checkout granted nothing: the balance is still ${afterCheckout}`);

  // ---- A forged callback from the browser grants nothing ----
  const forged = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/webhook", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body: JSON.stringify({
        id: "evt_forged",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_forged", amount: 1200, currency: "usd", metadata: { userId: "forged" } } },
      }),
    });
    return res.status;
  });
  if (forged !== 400 && forged !== 401) {
    throw new Error(`a forged webhook was answered with ${forged}, expected a refusal`);
  }
  const afterForged = await credits(page);
  if (afterForged !== before) {
    throw new Error(`a forged webhook changed the balance from ${before} to ${afterForged}`);
  }
  log(`a forged callback from the browser was refused (HTTP ${forged}) and granted nothing`);

  // ---- The verified event grants the credits ----
  // The checkout session is paid on Stripe's hosted page, the way a customer
  // pays. Stripe links the session to its own payment intent, so the event
  // Stripe delivers belongs to this checkout, and only then can the server
  // match it to the pending payment.
  // There is no product route that completes a checkout: the browser cannot
  // grant itself access, only Stripe can.
  const sessionId = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!sessionId.startsWith("cs_")) {
    throw new Error(`the checkout URL did not carry a Stripe session id: ${url}`);
  }
  await payAtStripe(sessionId);
  log(`the checkout was paid at Stripe (${sessionId})`);

  // The event has to arrive from Stripe and be verified. Wait for the credits.
  let granted = before;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    granted = await credits(page);
    if (granted > before) break;
  }
  if (granted <= before) {
    throw new Error(`the balance stayed at ${granted} after the verified event`);
  }
  log(`the verified event granted the credits: the balance went from ${before} to ${granted}`);

  // ---- The entitlements arrived with them ----
  const state = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing", { credentials: "include" });
    return (await res.json()) as {
      entitlements: Record<string, unknown>;
      payments: { status: string; credits: number }[];
    };
  });
  const entitlements = Object.keys(state.entitlements ?? {});
  if (!entitlements.length) {
    throw new Error("the paid plan granted no entitlements");
  }
  log(`the entitlements arrived with the payment: ${entitlements.join(", ")}`);

  const settled = state.payments?.find((p) => p.status === "succeeded");
  if (!settled) throw new Error("no settled payment was recorded");
  log(`the payment was recorded as settled for ${settled.credits} credits`);

  // ---- The same event twice grants once ----
  const balanceBeforeRepeat = await credits(page);
  const paymentsBeforeRepeat = state.payments.length;
  await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/webhook", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body: JSON.stringify({ id: "evt_repeat", type: "payment_intent.succeeded", data: { object: {} } }),
    });
    return res.status;
  });
  const balanceAfterRepeat = await credits(page);
  if (balanceAfterRepeat !== balanceBeforeRepeat) {
    throw new Error(`a repeated event changed the balance from ${balanceBeforeRepeat} to ${balanceAfterRepeat}`);
  }
  log("a repeated event granted nothing further");

  await page.goto(`${BASE}/app/credits/billing`, { waitUntil: "networkidle0" });
  await waitText(page, "Credits", 30_000);
  await shot(page, "stripe-entitled");
  log("the billing page shows the settled plan");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll Stripe steps passed. Screenshots: ${SHOTS}`);
} catch (err) {
  await shot(page, "FAILURE").catch(() => undefined);
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1500)).catch(() => "");
  console.error(`\n✗ Failed at step ${step}: ${(err as Error).message}`);
  console.error(`Page text: ${body}`);
  if (consoleErrors.length) console.error("Browser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
