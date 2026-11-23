/**
 * Verification of the Support Center (S13 customer's side).
 *
 * Sign up → verify OTP (via Mailpit) → open /app/support → submit a request →
 * confirm the reference appears and the request is listed → submit a second
 * request to confirm the list keeps both.
 *
 *   BASE_URL=http://localhost:3000 MAILPIT_URL=http://localhost:8025 pnpm e2e:support
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? "d:/web/ebooks-studio/e2e-shots/support";
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `support${Date.now()}@example.com`;
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
  (m) =>
    m.type() === "error" &&
    !m.text().includes("Failed to load resource") &&
    consoleErrors.push(m.text()),
);

const failures: string[] = [];
function check(condition: boolean, message: string) {
  if (condition) {
    log(message);
  } else {
    failures.push(message);
    console.error(`✗ ${message}`);
  }
}

try {
  // Sign up
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "Support Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await page.type("#confirmPassword", "password123");
  await clickButton(page, "Create account");
  await page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 15_000 });

  // Verify OTP
  const otp = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(otp, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  log("signed up and verified");

  // The support link is in the navigation. The sidebar is server-rendered but
  // the session is not, so the nav is only in the DOM once the client has
  // mounted; the wait is what makes this check deterministic rather than a
  // race against hydration.
  await page.waitForSelector('a[href="/app/support"]', { timeout: 20_000 });
  const navLink = await page.$('a[href="/app/support"]');
  check(Boolean(navLink), "the navigation links to the Support Center");

  // Open the Support Center.
  await page.goto(`${BASE}/app/support`, { waitUntil: "networkidle0" });
  await waitText(page, "Support Center");
  await waitText(page, "Ask for help");
  await waitText(page, "No requests yet");
  await shot(page, "support-empty");
  check(true, "the Support Center renders with its empty state");

  // Validation: the form refuses a short subject and a short message.
  await page.type('[data-testid="support-subject"]', "abc");
  await page.type('[data-testid="support-message"]', "short");
  await clickButton(page, "Send request");
  await waitText(page, "Give the subject at least four characters.");
  await waitText(page, "Describe the problem in at least ten characters.");
  await shot(page, "support-validation");
  check(true, "the form refuses a too-short subject and message");

  // A real request is accepted and a reference is shown.
  await page.$eval('[data-testid="support-subject"]', (el) => ((el as HTMLInputElement).value = ""));
  await page.$eval('[data-testid="support-message"]', (el) => ((el as HTMLTextAreaElement).value = ""));
  await page.click('[data-testid="support-subject"]');
  await page.type('[data-testid="support-subject"]', "My PDF export never finishes");
  await page.click('[data-testid="support-message"]');
  await page.type(
    '[data-testid="support-message"]',
    "I started a PDF export on my eBook and it has been queued for fifteen minutes without finishing.",
  );
  await page.select('[data-testid="support-category"]', "bug");
  await clickButton(page, "Send request");
  await waitText(page, "Your request was sent.");
  await shot(page, "support-sent");
  check(true, "a submitted request is acknowledged with a reference");

  // The request is listed, and it reads as unanswered.
  await waitText(page, "My PDF export never finishes");
  await waitText(page, "Waiting for an answer");
  await waitText(page, "No reply yet.");
  await shot(page, "support-listed");
  check(true, "the request is listed and reads as unanswered");

  // The reference is shown and can be copied.
  const reference = await page.$eval("code", (el) => el.textContent ?? "");
  check(reference.startsWith("sup-"), `the support reference is shown (${reference})`);

  // A second request is kept alongside the first.
  await page.type('[data-testid="support-subject"]', "A question about royalties");
  await page.type(
    '[data-testid="support-message"]',
    "How much of the sale price would I keep on the Amazon store if I priced the book at nine dollars?",
  );
  await page.select('[data-testid="support-category"]', "question");
  await clickButton(page, "Send request");
  await waitText(page, "A question about royalties");
  await shot(page, "support-two-requests");
  check(true, "a second request is kept alongside the first");

  // The count in the heading matches the requests on screen.
  const openCount = await page.$$eval('[data-testid^="support-request-"]', (els) => els.length);
  check(openCount === 2, `both requests are listed (${openCount} found)`);

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.join(" | ") || "none"})`);
} catch (err) {
  failures.push(`threw: ${String(err)}`);
  console.error(err);
  await shot(page, "failure").catch(() => undefined);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll Support Center checks passed.");
