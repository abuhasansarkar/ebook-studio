/**
 * Verification of the rebuilt library surfaces (S11 customer-facing UI).
 *
 * Sign up → verify OTP (via Mailpit) → create a book and a project through the
 * API → open /app/books and confirm the filter panel, the empty state and the
 * per-book organisation controls render → open /app/projects and confirm the
 * project can be created and edited through the dialog → open
 * /app/image-studio and confirm the upload panel and the empty state render →
 * confirm the delete confirmation is a styled dialog rather than a browser
 * prompt.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:library
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? "d:/web/ebooks-studio/e2e-shots/library";
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `library${Date.now()}@example.com`;
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
  await page.type("#name", "Library Tester");
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

  // Seed a book and a project through the API, using the browser's session.
  const seeded = await page.evaluate(async () => {
    const book = await fetch("/api/v1/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        brief: {
          topic: "A practical guide to sourdough baking for the home kitchen",
          title: "Sourdough at Home",
          bookType: "guide",
          targetAudience: "Home cooks who have never baked bread",
          knowledgeLevel: "beginner",
          language: "en",
          tone: "friendly",
          depth: "standard",
          chapterCount: 5,
          wordsPerChapter: 800,
        },
      }),
    });
    if (!book.ok) return { error: `book create failed: ${book.status}` };
    const bookId = ((await book.json()) as { book: { id: string } }).book.id;
    const project = await fetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: "The Sourdough Series", description: "Every book about bread." }),
    });
    if (!project.ok) return { error: `project create failed: ${project.status}` };
    const projectId = ((await project.json()) as { project: { id: string } }).project.id;
    return { bookId, projectId };
  });
  if ("error" in seeded && seeded.error) throw new Error(seeded.error);
  const { bookId, projectId } = seeded as { bookId: string; projectId: string };
  log("seeded a book and a project");

  // ---- The library ----
  await page.goto(`${BASE}/app/books`, { waitUntil: "networkidle0" });
  await waitText(page, "My eBooks");
  await waitText(page, "Filters");
  await waitText(page, "Sourdough at Home");
  await shot(page, "library-filters");

  // The filter panel is a real form, not a bare row of selects.
  const filterLabels = await page.$$eval("#filter-archived, #filter-projectId, #filter-language, #filter-bookType, #filter-status, #filter-sort", (els) => els.length);
  check(filterLabels === 6, `the library exposes six filters (${filterLabels} found)`);

  // The per-book organisation controls are present.
  await waitText(page, "Project");
  await waitText(page, "Archive");
  await waitText(page, "Duplicate");
  await waitText(page, "Delete");
  check(true, "each book card carries the organisation controls");

  // Assigning the book to the project writes through and persists.
  await page.select("#filter-archived", "active");
  await page.waitForFunction(() => !!document.querySelector('select[id^="project-for-"]'), { timeout: 15_000 });
  await page.select('select[id^="project-for-"]', projectId);
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector('select[id^="project-for-"]') as HTMLSelectElement | null;
      return el?.value === id;
    },
    { timeout: 15_000 },
    projectId,
  );
  await shot(page, "library-project-assigned");
  check(true, "a book is assigned to a project from the library");

  // The filter by that project finds it.
  await page.goto(`${BASE}/app/books?projectId=${projectId}&archived=all`, { waitUntil: "networkidle0" });
  await waitText(page, "Sourdough at Home");
  check(true, "filtering the library by project finds the book");

  // A filter that matches nothing shows the distinct empty state. The type has
  // to be one the API accepts, or the request is refused rather than empty.
  await page.goto(`${BASE}/app/books?bookType=recipe`, { waitUntil: "networkidle0" });
  await waitText(page, "No books match these filters");
  await shot(page, "library-empty-filtered");
  check(true, "a library with no matches explains the filters, not the library");

  // ---- Deleting a book asks for confirmation in a styled dialog ----
  await page.goto(`${BASE}/app/books`, { waitUntil: "networkidle0" });
  await waitText(page, "Sourdough at Home");
  await clickButton(page, "Delete");
  await page.waitForSelector("dialog[open]", { timeout: 10_000 });
  await waitText(page, "Delete this book?");
  await waitText(page, "Archive it instead");
  await shot(page, "library-delete-confirm");
  const dialogTitle = await page.$eval("dialog[open] h2", (el) => el.textContent ?? "");
  check(dialogTitle.includes("Delete this book?"), `deleting asks for confirmation in a dialog (${dialogTitle})`);
  // Cancel leaves the book alone.
  await clickButton(page, "Cancel");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), { timeout: 10_000 });
  await waitText(page, "Sourdough at Home");
  check(true, "cancelling the confirmation keeps the book");

  // ---- The projects screen ----
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle0" });
  await waitText(page, "Projects");
  await waitText(page, "The Sourdough Series");
  await waitText(page, "Every book about bread.");
  await shot(page, "projects-list");
  check(true, "the projects screen lists the project with its description");

  // Editing a project runs through the dialog.
  await clickButton(page, "Edit");
  await page.waitForSelector("dialog[open]", { timeout: 10_000 });
  await waitText(page, "Edit project");
  await page.$eval("#project-name", (el) => {
    (el as HTMLInputElement).value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type("#project-name", "The Bread Series");
  await clickButton(page, "Save project");
  await waitText(page, "The Bread Series");
  await shot(page, "projects-edited");
  check(true, "a project is renamed through the dialog");

  // Deleting a project asks for confirmation and says the books survive.
  await clickButton(page, "Delete");
  await page.waitForSelector("dialog[open]", { timeout: 10_000 });
  await waitText(page, "Delete this project?");
  await waitText(page, "stay in your library");
  await shot(page, "projects-delete-confirm");
  await clickButton(page, "Cancel");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), { timeout: 10_000 });
  check(true, "deleting a project explains that its books survive");

  // ---- The image library ----
  await page.goto(`${BASE}/app/image-studio`, { waitUntil: "networkidle0" });
  await waitText(page, "Image library");
  await waitText(page, "Upload an image");
  await waitText(page, "Choose an image");
  await waitText(page, "No images yet");
  await shot(page, "image-library-empty");
  check(true, "the image library renders its upload panel and empty state");

  // The upload panel states the real limits.
  const limits = await page.evaluate(() => document.body.innerText);
  check(limits.includes("10 MiB") && limits.includes("PNG") && limits.includes("WebP"), "the upload panel states the accepted formats and size limit");

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
console.log("\nAll Library surface checks passed.");
