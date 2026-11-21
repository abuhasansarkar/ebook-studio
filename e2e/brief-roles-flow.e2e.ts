/**
 * Brief editing and role management journey (run against a stack with AI_MOCK=1):
 * sign up → create a book → the book navigation shows its stages → open the
 * brief from the outline → edit and save it → the change survives a reload →
 * become an administrator → find a customer by email in the roles panel →
 * grant a role with a reason → revoke it through the confirmation dialog,
 * which refuses to proceed without a reason.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 \
 *   E2E_DATABASE=ebook_studio_test pnpm e2e:brief-roles
 */
import puppeteer, { type Page } from "puppeteer";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-brief-roles");
const DATABASE = process.env.E2E_DATABASE ?? "ebook_studio_test";
const PG_CONTAINER = process.env.PG_CONTAINER ?? "ebook-studio-postgres-1";
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-brief-${Date.now()}@example.com`;
let step = 0;

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  if (process.env.SKIP_SCREENSHOTS === "1") return;
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
}

async function waitText(page: Page, text: string, timeout = 30_000) {
  const needle = text.replace(/\s+/g, " ");
  await page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").includes(t), { timeout }, needle);
}

async function clickButton(page: Page, text: string) {
  const handle = await page.waitForSelector(
    `::-p-xpath(//button[contains(normalize-space(.), ${JSON.stringify(text)}) and not(@disabled)] | //a[contains(normalize-space(.), ${JSON.stringify(text)})])`,
    { timeout: 30_000 },
  );
  await handle!.click();
}

async function getOtp(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = (await res.json()) as { messages: { Snippet: string }[] };
    const m = data.messages[0]?.Snippet.match(/(\d{6})/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("OTP email not received");
}

/** Makes the journey's user an administrator, the one step no screen offers to a customer. */
async function makeAdministrator(target: string) {
  const script = `
    INSERT INTO admin_roles (id, "userId", role, reason, "grantedAt")
    SELECT 'e2e-role-' || substr(md5(random()::text), 1, 12), u.id, 'administrator', 'Granted by the brief and roles journey.', now()
    FROM "user" u WHERE u.email = '${target.replace(/'/g, "''")}'
    ON CONFLICT ("userId", role) DO UPDATE SET "revokedAt" = NULL, "revokeReason" = NULL;
  `;
  const file = path.join(SHOTS, "make-admin.sql");
  writeFileSync(file, script, "utf8");
  // CI reaches its database service over TCP; locally the Docker container is used.
  if (process.env.E2E_DATABASE_URL) {
    await execFileAsync("psql", [process.env.E2E_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", file]);
    return;
  }
  await execFileAsync("docker", ["cp", file, `${PG_CONTAINER}:/tmp/make-admin.sql`]);
  await execFileAsync("docker", ["exec", PG_CONTAINER, "psql", "-U", "ebook", "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-f", "/tmp/make-admin.sql"]);
}

async function inputValue(page: Page, selector: string) {
  return page.$eval(selector, (el) => (el as HTMLInputElement).value);
}

/** Replaces a controlled React field's text the way a person does. */
async function retype(page: Page, selector: string, text: string) {
  await page.click(selector, { count: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, text);
}

const browser = await puppeteer.launch({ headless: !process.env.HEADED, args: ["--no-sandbox"], defaultViewport: { width: 1360, height: 900 } });
const page = await browser.newPage();
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && consoleErrors.push(m.text()));

try {
  // ---- Sign up and create a book ----------------------------------------
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "Brief Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await clickButton(page, "Create account");
  await page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 20_000 });
  const otp = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(otp, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  log("signed up and verified");

  await page.goto(`${BASE}/app/create`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#topic");
  await page.type("#topic", "A practical guide to growing herbs on a balcony");
  await clickButton(page, "Continue");
  await page.waitForSelector("#targetAudience");
  await clickButton(page, "Continue");
  await page.waitForSelector("#chapterCount");
  await clickButton(page, "Create outline");
  await page.waitForFunction(() => location.pathname.endsWith("/outline"), { timeout: 20_000 });
  const bookId = new URL(page.url()).pathname.split("/")[3];
  await waitText(page, "Approve outline", 90_000);
  log(`book ${bookId} created and its outline planned`);

  // ---- Grouped book navigation ------------------------------------------
  const stages = await page.$$eval('nav[aria-label="Book steps"] [role="group"]', (groups) => groups.map((g) => g.getAttribute("aria-label")));
  if (stages.join(",") !== "Plan,Write,Polish,Publish") throw new Error(`Unexpected navigation stages: ${stages.join(",")}`);
  await shot(page, "outline-with-stages");
  log("the book navigation is grouped into Plan, Write, Polish and Publish");

  // ---- Edit the brief ----------------------------------------------------
  await clickButton(page, "Edit brief");
  await page.waitForFunction(() => location.pathname.endsWith("/brief"), { timeout: 20_000 });
  await page.waitForSelector("#topic");
  const topic = await page.$eval("#topic", (el) => (el as HTMLTextAreaElement).value);
  if (!topic.includes("growing herbs")) throw new Error(`The brief did not load the saved idea: ${topic}`);
  await waitText(page, "All changes saved");
  await retype(page, "#targetAudience", "Apartment dwellers with no garden");
  await waitText(page, "Unsaved changes");
  await shot(page, "brief-dirty");
  await clickButton(page, "Save brief");
  await waitText(page, "Brief saved");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("#targetAudience");
  const audience = await inputValue(page, "#targetAudience");
  if (audience !== "Apartment dwellers with no garden") throw new Error(`The saved brief did not survive a reload: ${audience}`);
  await shot(page, "brief-saved");
  log("the brief was edited, saved and kept after a reload");

  // An invalid brief is refused in the form, not sent.
  await retype(page, "#topic", "abc");
  await clickButton(page, "Save brief");
  await waitText(page, "Describe your idea in at least a few words");
  await clickButton(page, "Discard");
  log("an invalid brief is refused in the form and can be discarded");

  // A full page load of each planning screen must hydrate without a mismatch:
  // the server cannot know the session, so it must render what the browser
  // renders first. Any mismatch is caught by the console check at the end.
  for (const screen of ["brief", "outline", "generate"]) {
    await page.goto(`${BASE}/app/books/${bookId}/${screen}`, { waitUntil: "networkidle0" });
    await page.waitForSelector('nav[aria-label="Book steps"]');
  }
  log("the brief, outline and write screens load directly without a hydration mismatch");

  // ---- Role management ---------------------------------------------------
  await makeAdministrator(email);
  await page.goto(`${BASE}/app/admin`, { waitUntil: "networkidle0" });
  await clickButton(page, "Roles");
  await page.waitForSelector('[data-testid="role-user-search"]');
  await page.type('[data-testid="role-user-search"]', email);
  await clickButton(page, "Search");
  await page.waitForSelector('ul[aria-label="Matching customers"] button', { timeout: 20_000 });
  await page.click('ul[aria-label="Matching customers"] button');
  await page.waitForSelector('[data-testid="role-target"]');
  await page.select('[data-testid="role-select"]', "finance");
  const grantDisabled = await page.$eval('[data-testid="grant-role"]', (el) => (el as HTMLButtonElement).disabled);
  if (!grantDisabled) throw new Error("Grant was available without a reason");
  await page.type('[data-testid="role-reason"]', "Covering month-end refunds this week.");
  await shot(page, "roles-grant-ready");
  await page.click('[data-testid="grant-role"]');
  await waitText(page, "Covering month-end refunds this week.");
  log("a customer was found by email and granted a role with a reason");

  // Revoke goes through a dialog that needs its own reason.
  const revoke = await page.waitForSelector(
    `::-p-xpath(//div[.//p[contains(., "Covering month-end refunds")]]/div/button[normalize-space(.)="Revoke"])`,
  );
  await revoke!.click();
  await page.waitForSelector("#revoke-reason");
  const confirmDisabled = await page.$eval('::-p-xpath(//button[normalize-space(.)="Revoke role"])', (el) => (el as HTMLButtonElement).disabled);
  if (!confirmDisabled) throw new Error("Revoke was available without a reason");
  await page.type("#revoke-reason", "Month-end cover has finished.");
  await shot(page, "roles-revoke-dialog");
  await clickButton(page, "Revoke role");
  await page.waitForFunction(() => !document.body.innerText.includes("Covering month-end refunds this week."), { timeout: 20_000 });
  await shot(page, "roles-after-revoke");
  log("the role was revoked only after a reason was given");

  if (consoleErrors.length) throw new Error(`Browser errors:\n${consoleErrors.join("\n")}`);
  console.log(`\nAll checks passed. Screenshots: ${SHOTS}`);
} catch (error) {
  await shot(page, "failure").catch(() => undefined);
  console.error(`✗ ${(error as Error).message}`);
  if (consoleErrors.length) console.error(`Browser errors:\n${consoleErrors.join("\n")}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
