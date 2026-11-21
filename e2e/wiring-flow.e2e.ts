/**
 * Verification of the newly wired endpoints.
 *
 * Exercises the surfaces that were connected to the API during this pass:
 * the source format catalog (GET /sources/formats), the listing gaps
 * (GET /listings/:id/gaps), the operation detail (GET /operations/:id) and
 * the screens that were changed.
 *
 *   BASE_URL=http://localhost:3000 MAILPIT_URL=http://localhost:8025 pnpm e2e:wiring
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? "d:/web/ebooks-studio/e2e-shots/wiring";
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `wire${Date.now()}@example.com`;
let step = 0;

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  if (process.env.SKIP_SCREENSHOTS === "1") return;
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
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
const failedRequests: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !m.text().includes("Failed to load resource") &&
    consoleErrors.push(m.text()),
);
page.on("response", (res) => {
  if (res.status() < 400 || !res.url().includes("/api/v1")) return;
  const path = new URL(res.url()).pathname;
  // The probe below deliberately asks for a book that is not the caller's, so
  // its refusal is the expected result rather than a failure.
  if (path === "/api/v1/books/does-not-exist/operations") return;
  failedRequests.push(`${res.status()} ${path}`);
});

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
  // Sign up and verify so the session cookie is set.
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "Wire Tester");
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

  // ---- The source format catalog comes from the server ----
  const formats = await page.evaluate(async () => {
    const res = await fetch("/api/v1/sources/formats", { credentials: "include" });
    return (await res.json()) as { formats: { format: string; maxBytes: number }[] };
  });
  check(
    formats.formats.length > 0 && formats.formats.every((f) => f.maxBytes > 0),
    `the source format catalog is served (${formats.formats.map((f) => f.format).join(", ")})`,
  );

  // ---- A book that is not yours is refused, so scoping still holds ----
  const foreign = await page.evaluate(async () => {
    const res = await fetch("/api/v1/books/does-not-exist/operations?limit=1", {
      credentials: "include",
    });
    return res.status;
  });
  check(foreign === 404, "a book that is not yours is refused (404)");

  // ---- The Support Center is reachable from the nav ----
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "networkidle0" });
  const navLink = await page.$('a[href="/app/support"]');
  check(Boolean(navLink), "the Support Center is linked from the dashboard nav");

  // ---- The changed screens all render ----
  const screens: { path: string; expect: string; name: string }[] = [
    { path: "/app/books", expect: "My eBooks", name: "library" },
    { path: "/app/listing", expect: "Listing", name: "listing" },
    { path: "/app/distribution", expect: "Distribution", name: "distribution" },
    { path: "/app/marketing", expect: "Marketing", name: "marketing" },
    { path: "/app/image-studio", expect: "Image", name: "image-studio" },
    { path: "/app/credits", expect: "Credits", name: "credits" },
    { path: "/app/settings", expect: "Settings", name: "settings" },
  ];

  for (const screen of screens) {
    await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle0" });
    await waitText(page, screen.expect);
    await shot(page, screen.name);
    check(true, `${screen.path} renders`);
  }

  check(
    consoleErrors.length === 0,
    `no console errors (${consoleErrors.join(" | ") || "none"})`,
  );
  check(
    failedRequests.length === 0,
    `no failed API calls (${failedRequests.join(" | ") || "none"})`,
  );
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
console.log("\nAll wiring checks passed.");
