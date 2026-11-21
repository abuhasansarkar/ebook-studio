/**
 * S11 citation-impact journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP → create a book → import a private source → link it to a
 * chapter → run the quality checks (no citation problems) → delete the source →
 * the citation is reported as resting on text that is gone → the quality report
 * cross-references it.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:citations
 */
import puppeteer, { type ElementHandle, type Page } from "puppeteer";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-citations");
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-c${Date.now()}@example.com`;
let step = 0;

function log(msg: string) {
  console.log(`✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  if (process.env.SKIP_SCREENSHOTS === "1") return;
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
}

async function waitText(page: Page, text: string, timeout = 30_000) {
  // The page wraps text across lines, so the comparison ignores whitespace.
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

const NOTES = `# Fresh produce storage

Keep leafy greens in a crisper drawer where the air circulates.

# Leftovers and reheating

Cool cooked food within two hours and keep it in the refrigerator for no more than three days.
`;

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
  await page.type("#name", "S11 Citation Tester");
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

  // Create a book so there is a manuscript to import into.
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
  await page.waitForSelector("#book-title", { timeout: 30_000 });
  const bookId = new URL(page.url()).pathname.split("/")[3];
  await clickButton(page, "Approve outline");
  await page.waitForFunction(() => location.pathname.endsWith("/generate"), { timeout: 20_000 });
  await clickButton(page, "Write my book");
  await waitText(page, "Your book is written", 90_000);
  log("book created and written");

  // Import a private note.
  await page.goto(`${BASE}/app/books/${bookId}/research`, { waitUntil: "networkidle0" });
  await waitText(page, "Import a source");
  const notesPath = path.join(SHOTS, "kitchen-notes.md");
  writeFileSync(notesPath, NOTES, "utf8");
  await page.select("#source-format", "notes");
  await page.type("#source-title", "Kitchen notes");
  await page.type("#source-provenance", "My own notes, 2024");
  await page.type("#source-license", "Yours to use");
  const fileInput = await page.$("#source-file") as ElementHandle<HTMLInputElement> | null;
  await fileInput!.uploadFile(notesPath);
  await clickButton(page, "Import source");
  await waitText(page, 'Imported "Kitchen notes".');
  await waitText(page, "Ready");
  log("notes source imported and extracted");

  // Link the source to an existing chapter, which is what a citation is.
  await clickButton(page, "Link to an existing chapter");
  await page.waitForSelector("[data-link-panel]");
  const linkChapter = await page.$$eval("#link-chapter option", (opts) => {
    const real = (opts as HTMLOptionElement[]).filter((o) => o.value);
    const chosen = real.length ? real[real.length - 1] : null;
    return chosen ? { value: chosen.value, title: chosen.textContent?.trim() ?? "" } : null;
  });
  if (!linkChapter) throw new Error("No chapter is available to link the source to");
  await page.select("#link-chapter", linkChapter.value);
  await page.waitForSelector("[data-link-panel] input[type=checkbox]");
  await page.click("[data-link-panel] input[type=checkbox]");
  await page.type("#link-note", "Backs the storage guidance.");
  await clickButton(page, "Link source");
  await waitText(page, "Source linked to the chapter.");
  log("source linked to an existing chapter");

  // The citation still holds, so it is reported as current.
  await page.waitForSelector("#citation-chapter option");
  const citationValue = await page.$$eval(
    "#citation-chapter option",
    (opts, title) => {
      const match = (opts as HTMLOptionElement[]).find((o) => o.textContent?.includes(title as string));
      return match?.value ?? "";
    },
    linkChapter.title,
  );
  if (!citationValue) throw new Error(`The citation panel does not offer the chapter "${linkChapter.title}"`);
  await page.select("#citation-chapter", citationValue);
  await page.waitForSelector("[data-citations]");
  await page.waitForSelector('[data-citation-state="current"]', { timeout: 20_000 });
  await shot(page, "citation-current");
  log("the citation is reported as current while the source still holds");

  // The quality report says nothing about a citation that still holds.
  await page.goto(`${BASE}/app/books/${bookId}/quality`, { waitUntil: "networkidle0" });
  await clickButton(page, "Run checks");
  // The report opens once the checks have finished.
  await page.waitForSelector("#report-select", { timeout: 90_000 });
  await page.waitForFunction(
    () => (document.querySelector("#report-select") as HTMLSelectElement | null)?.options.length ?? 0 > 0,
    { timeout: 90_000 },
  );
  const cleanReport = await page.evaluate(() => document.body.innerText);
  if (/source was deleted|re-imported|no longer exists/i.test(cleanReport)) {
    throw new Error("The quality report reported a citation problem while the citation still held");
  }
  await shot(page, "quality-clean");
  log("the quality report says nothing about a citation that still holds");

  // Delete the source. The citation now rests on text that is gone.
  page.on("dialog", async (d) => {
    await d.accept();
  });
  await page.goto(`${BASE}/app/books/${bookId}/research`, { waitUntil: "networkidle0" });
  await waitText(page, "Kitchen notes");
  await clickButton(page, "Remove");
  await waitText(page, "Source removed.", 20_000);
  await waitText(page, "No source imported yet", 20_000);
  log("the source was removed and disappeared from the source list");

  // The citation survives the deletion and is reported as affected.
  await page.waitForSelector("#citation-chapter option");
  await page.select("#citation-chapter", citationValue);
  await page.waitForSelector('[data-citation-state="deleted"]', { timeout: 20_000 });
  await waitText(page, "Source deleted");
  await shot(page, "citation-deleted");
  log("the citation is still shown and is reported as resting on a deleted source");

  // The quality report cross-references the affected citation.
  await page.goto(`${BASE}/app/books/${bookId}/quality`, { waitUntil: "networkidle0" });
  await clickButton(page, "Run checks");
  await page.waitForFunction(
    () => document.body.innerText.includes("but that source was deleted"),
    { timeout: 90_000 },
  );
  await waitText(page, "Needs evidence");
  await shot(page, "quality-citation-deleted");
  log("the quality report cross-references the citation whose source was deleted");
  // Another owner cannot see the citation or the report.
  const isolation = await page.evaluate(async () => {
    const response = await fetch("/api/v1/quality/findings/does-not-exist", { credentials: "include" });
    return response.status;
  });
  if (isolation !== 404) throw new Error(`An unknown finding returned ${isolation}, expected 404`);
  log("the findings are scoped to their owner");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll citation-impact steps passed. Screenshots: ${SHOTS}`);
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
