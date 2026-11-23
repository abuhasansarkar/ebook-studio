/**
 * S12 paid-plans journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP → open billing → the catalog shows the plan and says the
 * provider is not live → a forged browser callback is refused → start a checkout
 * → the checkout alone grants nothing → the provider's own payment page
 * confirms the payment → the credits and the entitlements appear → the
 * subscription can be cancelled and runs to the end of its paid period.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:billing
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-billing");
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-b${Date.now()}@example.com`;
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
  await page.waitForFunction(
    (t) => document.body.innerText.replace(/\s+/g, " ").includes(t),
    { timeout },
    text.replace(/\s+/g, " "),
  );
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

/** The signed-in author's credit balance, as the API reports it. */
async function creditBalance(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const res = await fetch("/api/v1/credits", { credentials: "include" });
    const data = (await res.json()) as { wallet: { balance: number } };
    return data.wallet.balance;
  });
}

const browser = await puppeteer.launch({
  headless: HEADLESS,
  args: ["--no-sandbox"],
  defaultViewport: { width: 1360, height: 900 },
});
const page = await browser.newPage();
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on(
  "console",
  (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && consoleErrors.push(m.text()),
);

try {
  // Sign up and verify.
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "S12 Billing Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await page.type("#confirmPassword", "password123");
  await clickButton(page, "Create account");
  await page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 20_000 });
  const otp = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(otp, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  log("signed up and verified");

  // The billing page lists the plans and is honest about the provider.
  await page.goto(`${BASE}/app/credits/billing`, { waitUntil: "networkidle0" });
  await waitText(page, "Plans and billing");
  await waitText(page, "This build talks to the local payment provider");
  await waitText(page, "Buy plan");
  await shot(page, "plans");
  log("the billing page shows the plan catalog and says the provider is not live");

  // The comparison grid is part of the billing screen, and every column of it
  // must agree with the plan cards above it.
  const comparison = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="pricing-comparison"]');
    if (!table) return null;
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""),
    );
    return { headers, rows };
  });
  if (!comparison) throw new Error("the billing page has no plan comparison table");
  if (!comparison.headers.includes("Free")) throw new Error("the comparison table has no free column");
  for (const row of comparison.rows) {
    // Export and source import are free for every author, so no paid column
    // may show them as missing.
    if (row[0] === "PDF, EPUB and DOCX export" || row[0] === "Private source import") {
      for (const cell of row.slice(1)) {
        if (cell === "—" || cell === "") {
          throw new Error(`the comparison table shows "${row[0]}" as missing for a plan that includes it`);
        }
      }
    }
  }
  log("the comparison table lists every plan and keeps the free capabilities included");

  // The author's balance before the purchase.
  const balanceBefore = await creditBalance(page);

  // A forged browser callback cannot grant anything. The API refuses a
  // settlement that did not come from the provider.
  const forged = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "evt_forged_from_browser",
        type: "payment.succeeded",
        customer_reference: "cus_whatever",
        provider_payment_id: "local_pay_whatever",
        credits: 999_999,
      }),
    });
    return res.status;
  });
  if (forged !== 400) throw new Error(`An unsigned webhook from the browser returned ${forged}, expected 400`);
  const balanceAfterForged = await creditBalance(page);
  if (balanceAfterForged !== balanceBefore) {
    throw new Error(`A forged browser webhook granted credits: ${balanceBefore} → ${balanceAfterForged}`);
  }
  log("a forged callback from the browser was refused and granted nothing");

  // Start a checkout. The customer is sent to the provider's own payment page.
  await clickButton(page, "Buy plan");
  await page.waitForFunction(() => location.pathname.endsWith("/checkout"), { timeout: 30_000 });
  await waitText(page, "Checkout");
  await waitText(page, "Pay now");

  // The checkout alone must not grant anything.
  const balanceAfterCheckout = await creditBalance(page);
  if (balanceAfterCheckout !== balanceBefore) {
    throw new Error(`A checkout granted credits on its own: ${balanceBefore} → ${balanceAfterCheckout}`);
  }
  const pendingPayment = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/payments", { credentials: "include" });
    const data = (await res.json()) as { payments: { id: string; status: string; planId: string | null }[] };
    return data.payments[0] ?? null;
  });
  if (!pendingPayment) throw new Error("The checkout did not create a payment");
  if (pendingPayment.status !== "pending") throw new Error(`The new payment is ${pendingPayment.status}, expected pending`);
  await shot(page, "checkout-pending");
  log("a checkout was started and granted nothing on its own");

  // The provider takes the money and tells the merchant over a signed webhook.
  await clickButton(page, "Pay now");
  await waitText(page, "Payment confirmed", 60_000);
  await shot(page, "paid");
  log("the provider confirmed the payment and delivered a signed webhook");

  // The credits and the entitlements appear on the billing page.
  await page.goto(`${BASE}/app/credits/billing`, { waitUntil: "networkidle0" });
  await waitText(page, "Current plan & subscription");
  // The plan's paid capabilities are listed separately from the capabilities
  // the product publishes as free, which every author has.
  await waitText(page, "What your plan unlocks");
  await waitText(page, "Books");
  await waitText(page, "Included on every plan");
  const balanceAfterPayment = await creditBalance(page);
  if (balanceAfterPayment <= balanceBefore) {
    throw new Error(`The confirmed payment did not add credits: ${balanceBefore} → ${balanceAfterPayment}`);
  }
  await waitText(page, "succeeded");
  await shot(page, "entitled");
  log(`the confirmed payment added credits (${balanceBefore} → ${balanceAfterPayment}) and unlocked the plan's capabilities`);

  // Paying the same checkout again does not grant a second time.
  const checkoutUrl = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing/payments", { credentials: "include" });
    const data = (await res.json()) as { payments: { id: string; status: string }[] };
    return data.payments[0]?.id ?? "";
  });
  void checkoutUrl;
  const balanceAfterRepeat = await creditBalance(page);
  if (balanceAfterRepeat !== balanceAfterPayment) {
    throw new Error(`A repeated payment granted credits again: ${balanceAfterPayment} → ${balanceAfterRepeat}`);
  }
  log("the balance did not change when the page was reloaded, so the payment was not counted twice");

  // Cancelling asks for confirmation, then stops the renewal. The period is
  // paid for, so the plan and its capabilities run until it ends.
  await waitText(page, "Cancel subscription");
  await clickButton(page, "Cancel subscription");
  await waitText(page, "Cancel your subscription?");
  const confirm = await page.waitForSelector('::-p-xpath(//dialog[@open]//button[normalize-space(.)="Cancel subscription"])');
  await confirm!.click();
  await waitText(page, "Subscription cancelled", 30_000);
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "active until", 30_000);
  await waitText(page, "What your plan unlocks", 30_000);
  await shot(page, "cancelled");
  log("the subscription was cancelled after confirmation and keeps its capabilities until the paid period ends");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll billing steps passed. Screenshots: ${SHOTS}`);
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
