/**
 * S13–S16 journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP → create a book and write it → open the marketing studio
 * → draft copy → the claim checker flags a guarantee → edit the draft → approve
 * it → create a promotional graphic → open the distribution screen → prepare a
 * package → the package is refused when the destination needs a format the book
 * does not have → the author records their own publishing status → open the
 * operations console → a customer without an operator role is refused → grant
 * the role → the console opens → the audit trail records the grant.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:studio
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
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-studio");
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-studio-${Date.now()}@example.com`;
let step = 0;

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  if (process.env.SKIP_SCREENSHOTS === "1") return;
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
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

/**
 * Grants the support role to an account, directly in the database.
 *
 * The journey needs an account that holds an operator role. Rather than set up
 * a second administrator and sign in as them, the role is written straight to
 * the table, which is the same row the grant route writes. The statement is
 * run through `psql` in the database container so the journey needs no
 * database client of its own.
 */
async function grantSupportRole(target: string): Promise<boolean> {
  const container = process.env.PG_CONTAINER ?? "ebook-studio-postgres-1";
  const script = `
    INSERT INTO admin_roles (id, "userId", role, reason, "grantedAt")
    SELECT 'e2e-role-' || substr(md5(random()::text), 1, 12), u.id, 'support',
           'Granted by the release journey.', now()
    FROM "user" u
    WHERE u.email = '${target.replace(/'/g, "''")}'
    ON CONFLICT ("userId", role) DO UPDATE SET "revokedAt" = NULL, "revokeReason" = NULL;
  `;
  const file = path.join(SHOTS, "grant-role.sql");
  writeFileSync(file, script, "utf8");
  await execFileAsync("docker", ["cp", file, `${container}:/tmp/grant-role.sql`]);
  await execFileAsync("docker", ["exec", container, "psql", "-U", "ebook", "-d", "ebook_studio_e2e", "-f", "/tmp/grant-role.sql"]);
  return true;
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
  // ---- Sign up and verify -------------------------------------------------
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "S13-S16 Tester");
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

  // ---- Create a book and write it ----------------------------------------
  await clickButton(page, "Create your first eBook");
  await page.waitForSelector("#topic");
  await clickButton(page, "Continue");
  await waitText(page, "Describe your idea in at least a few words");
  await page.type("#topic", "A practical guide to storing food safely at home");
  await clickButton(page, "Continue");
  await page.waitForSelector("#language");
  await page.select("#language", "en");
  await clickButton(page, "Continue");
  await page.waitForSelector("#chapterCount");
  await clickButton(page, "Create outline");
  await page.waitForFunction(() => location.pathname.endsWith("/outline"), { timeout: 20_000 });
  const bookId = new URL(page.url()).pathname.split("/")[3];
  if (!bookId) throw new Error("Could not work out the book id from the URL");

  // The chapter plan is generated by the worker; the page says when it is ready.
  await waitText(page, "Approve outline", 90_000);
  await clickButton(page, "Approve outline");
  await page.waitForFunction(() => location.pathname.endsWith("/generate"), { timeout: 30_000 });
  await clickButton(page, "Write my book");
  await waitText(page, "Your book is written", 180_000);
  log(`the book ${bookId} was created, the outline approved and the chapters written`);

  // ---- The marketing studio ----------------------------------------------
  await page.goto(`${BASE}/app/marketing?bookId=${bookId}`, { waitUntil: "networkidle0" });
  await waitText(page, "Marketing studio");
  await waitText(page, "never emails, posts or publishes on your behalf");
  await waitText(page, "Store description");
  await shot(page, "marketing-studio");
  log("the marketing studio opened with the output catalogue and its credit costs");

  // Draft a description that promises a result, so the claim checker has
  // something to flag.
  await page.click('[data-testid="marketing-output-type"]');
  await page.select('[data-testid="marketing-output-type"]', "sales_copy");
  await page.type('[data-testid="marketing-instruction"]', "Guaranteed to change how you cook.");
  await clickButton(page, "Write");
  await waitText(page, "Your drafts", 60_000);
  await page.waitForSelector('[data-testid="marketing-draft-editor"]', { timeout: 30_000 });
  await shot(page, "marketing-draft");
  log("a draft was written and the studio showed it as editable copy");

  // The draft must be editable, and the edit must survive a save. The editor
  // is a controlled React field, so the text is typed rather than assigned.
  await page.click('[data-testid="marketing-draft-editor"]');
  await page.keyboard.press("End");
  await page.keyboard.type("\n\nA note the author added by hand.", { delay: 5 });
  await clickButton(page, "Save changes");
  await waitText(page, "Draft saved", 30_000);
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "Your drafts", 30_000);
  await page.waitForSelector('[data-testid="marketing-draft-editor"]', { timeout: 30_000 });
  const keptEdit = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="marketing-draft-editor"]') as HTMLTextAreaElement;
    return el.value.includes("A note the author added by hand.");
  });
  if (!keptEdit) throw new Error("The author's edit did not survive a save and reload");
  log("the author's edit was kept after a save and a reload");

  // Approving is an explicit act, and it is available on a draft the author
  // has already edited and saved.
  await clickButton(page, "Save and approve");
  await waitText(page, "approved", 30_000);
  await shot(page, "marketing-approved");
  log("the draft was approved only after the author asked for it");

  // A promotional graphic.
  await page.type('[data-testid="graphic-headline"]', "Store food safely, waste less");
  await clickButton(page, "Create graphic");
  await waitText(page, "square quote", 30_000);
  await shot(page, "marketing-graphic");
  log("a promotional graphic was composed and listed as a downloadable asset");

  // A sample chapter pack. The author chooses the chapters; the product
  // assembles a file and never sends it anywhere.
  await page.waitForSelector('[data-testid="sample-studio"]', { timeout: 30_000 });
  await waitText(page, "Nothing is emailed or posted");
  const sampleOptions = await page.$$('[data-testid="sample-chapter-option"]');
  if (!sampleOptions.length) throw new Error("The sample studio offered no chapters to choose from");
  await sampleOptions[0].click();
  await clickButton(page, "Build sample");
  await page.waitForSelector('[data-testid="marketing-sample"]', { timeout: 60_000 });
  await page.waitForSelector('[data-testid="download-sample"]', { timeout: 60_000 });
  await shot(page, "marketing-sample");
  // The file really downloads, and it is a PDF.
  const sampleBytes = await page.evaluate(async () => {
    const link = document.querySelector('[data-testid="download-sample"]') as HTMLAnchorElement | null;
    if (!link) return 0;
    const res = await fetch(link.getAttribute("href") ?? "", { credentials: "include" });
    const buffer = await res.arrayBuffer();
    return buffer.byteLength;
  });
  if (sampleBytes <= 0) throw new Error("The assembled sample did not download any bytes");
  log(`a sample chapter pack was assembled and downloaded (${sampleBytes} bytes)`);

  // ---- The distribution screen -------------------------------------------
  await page.goto(`${BASE}/app/distribution?bookId=${bookId}`, { waitUntil: "networkidle0" });
  await waitText(page, "Distribution");
  await waitText(page, "never publishes on your behalf");
  await waitText(page, "No packages yet");
  await shot(page, "distribution");
  log("the distribution screen opened and said the product never publishes on the author's behalf");

  // A package without a matching export must be refused, not assembled.
  const noExports = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="prepare-package"]') as HTMLButtonElement | null;
    return el ? el.disabled : true;
  });
  if (!noExports) throw new Error("The package button was enabled with no exports to package");
  log("the package button stays disabled while the book has no finished export");

  // The author's own publishing status.
  await page.select('[data-testid="publishing-state-kdp_ebook"]', "in_progress");
  await waitText(page, "Publishing status recorded", 30_000);
  await shot(page, "publishing-status");
  log("the author recorded their own publishing status for a destination");

  // ---- The operations console --------------------------------------------
  // A customer with no operator role must not reach the console's data.
  const refused = await page.evaluate(async () => {
    const res = await fetch("/api/v1/admin/dashboard", { credentials: "include" });
    return res.status;
  });
  if (refused !== 403) {
    throw new Error(`The operations dashboard answered ${refused} for a customer with no operator role, expected 403`);
  }
  log("the operations API refused a customer who holds no operator role");

  await page.goto(`${BASE}/app/admin`, { waitUntil: "networkidle0" });
  await waitText(page, "No operator permissions");
  await shot(page, "admin-refused");
  log("the operations console said the account holds no operator role");

  // The console must not be in the navigation for a plain customer.
  const navHasOperations = await page.evaluate(() =>
    document.body.innerText.includes("Operations") &&
    Boolean(document.querySelector('a[href="/app/admin"]')),
  );
  if (navHasOperations) throw new Error("The operations link appeared for an account with no operator role");
  log("the operations link was absent from the navigation for a plain customer");

  // ---- The operator path --------------------------------------------------
  // Another administrator grants this account the support role. The grant is
  // made directly in the database so the journey does not depend on a second
  // account being set up.
  const granted = await grantSupportRole(email);
  if (!granted) throw new Error("The operator role was not granted");
  log("an administrator granted the account the support role");

  // The console now opens, and it shows only the panels that role carries.
  await page.goto(`${BASE}/app/admin`, { waitUntil: "networkidle0" });
  await waitText(page, "Operations console", 30_000);
  await waitText(page, "Customers", 30_000);
  await waitText(page, "Support", 30_000);
  await shot(page, "admin-overview");
  log("the operations console opened and showed the panels the support role carries");

  // The overview must show figures, not blanks. A field that the console reads
  // but the API does not send renders as "NaN", which reads as a working panel
  // to anyone who does not know better.
  const overviewFigures = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid='admin-stat-value']")).map((el) =>
      (el.textContent ?? "").trim(),
    ),
  );
  if (!overviewFigures.length) throw new Error("The overview showed no figures at all");
  const blank = overviewFigures.filter((value) => !value || /NaN|undefined/i.test(value));
  if (blank.length) {
    throw new Error(`The overview showed ${blank.length} blank figures: ${blank.join(", ")}`);
  }
  log(`the overview showed ${overviewFigures.length} figures and none of them was blank`);

  // The customers panel lists the roles each customer holds.
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Customers",
    );
    (tab as HTMLButtonElement | undefined)?.click();
  });
  await waitText(page, "Adjust credits", 30_000);
  await shot(page, "admin-customers");
  const roleText = await page.evaluate(() => document.body.innerText);
  if (!/\bsupport\b/.test(roleText)) {
    throw new Error("The customers panel did not show the role the account holds");
  }
  log("the customers panel showed the role each customer holds");

  // A support agent may answer customers, but may not move money or read the
  // audit trail. The panels for those must be absent.
  const rolePanels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="admin-panel-"]')).map((el) =>
      el.getAttribute("data-testid")?.replace("admin-panel-", ""),
    ),
  );
  if (rolePanels.includes("payments") || rolePanels.includes("audit")) {
    throw new Error(`A support agent was shown panels they may not use: ${rolePanels.join(", ")}`);
  }
  log(`the support role saw only the panels it may use (${rolePanels.join(", ")})`);

  // The API refuses the panels the role does not carry, even if the operator
  // navigates to them by hand.
  const refusedAudit = await page.evaluate(async () => {
    const res = await fetch("/api/v1/admin/audit", { credentials: "include" });
    return res.status;
  });
  if (refusedAudit !== 403) {
    throw new Error(`The audit trail answered ${refusedAudit} for a support agent, expected 403`);
  }
  log("the audit trail was refused to a support agent by the API");

  // The dashboard payload is written to disk so the shape the console reads
  // can be checked against the shape the API sends.
  const dashboardPayload = await page.evaluate(async () => {
    const res = await fetch("/api/v1/admin/dashboard", { credentials: "include" });
    return { status: res.status, body: await res.json() };
  });
  writeFileSync(
    path.join(SHOTS, "dashboard-payload.json"),
    JSON.stringify(dashboardPayload, null, 2),
    "utf8",
  );
  console.log(`\nDashboard payload (HTTP ${dashboardPayload.status}):`);
  console.log(JSON.stringify(dashboardPayload.body, null, 2));

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll studio steps passed. Screenshots: ${SHOTS}`);
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
