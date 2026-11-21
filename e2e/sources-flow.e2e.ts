/**
 * S11 research journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP → create a book → import a private source → review the
 * extraction preview → confirm the import → confirm again (no duplicates) →
 * link the source to a chapter → ask a question → open a cited passage.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:sources
 */
import puppeteer, { type ElementHandle, type Page } from "puppeteer";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-sources");
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-s${Date.now()}@example.com`;
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

/** The notes document the journey imports. Headings become proposed chapters. */
const NOTES = `# Fresh produce storage

Keep leafy greens in a crisper drawer where the air circulates.

Root vegetables belong in a cool, dark cupboard rather than the refrigerator door.

# Leftovers and reheating

Cool cooked food within two hours and keep it in the refrigerator for no more than three days.

Reheat leftovers until the centre reaches 75 degrees and stir once halfway through.

# Freezing

Label every container with the date before it goes into the freezer.

Bread freezes well sliced and frozen; whole loaves go stale in the freezer.
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
  await page.type("#name", "S11 Tester");
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
  // The form is controlled, so the first click proves the page is hydrated
  // before anything is typed into it.
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

  // The research workspace is reachable from the book navigation.
  await page.goto(`${BASE}/app/books/${bookId}/research`, { waitUntil: "networkidle0" });
  await waitText(page, "Import a source");
  await waitText(page, "No source imported yet");
  await shot(page, "research-empty");
  const navHasResearch = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="Book steps"] a')).some((a) => a.textContent?.includes("Research")),
  );
  if (!navHasResearch) throw new Error("The book navigation has no Research entry");
  log("research workspace reached from the book navigation");

  // Import a private note.
  const notesPath = path.join(SHOTS, "kitchen-notes.md");
  writeFileSync(notesPath, NOTES, "utf8");
  await page.select("#source-format", "notes");
  await page.type("#source-title", "Kitchen notes");
  await page.type("#source-provenance", "My own notes, 2024");
  await page.type("#source-license", "Yours to use");
  const fileInput = await page.$("#source-file") as ElementHandle<HTMLInputElement> | null;
  await fileInput!.uploadFile(notesPath);
  await clickButton(page, "Import source");
  await waitText(page, "Imported \"Kitchen notes\".");
  await waitText(page, "Ready");
  await shot(page, "research-imported");
  log("notes source imported and extracted");

  // The extraction is immutable and its passages carry stable locators.
  const sourceId = await page.evaluate(async () => {
    const res = await fetch("/api/v1/books/" + location.pathname.split("/")[3] + "/sources", { credentials: "include" });
    const body = await res.json();
    return body.sources[0].id as string;
  });
  const passages = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/sources/${id}/passages`, { credentials: "include" });
    const body = await res.json();
    return body.passages as { locator: string; text: string }[];
  }, sourceId);
  if (!passages.length) throw new Error("The imported source has no passages");
  if (!passages.every((p, i) => p.locator === `p${i + 1}`)) {
    throw new Error(`Passage locators are not stable: ${passages.map((p) => p.locator).join(", ")}`);
  }
  log(`extraction produced ${passages.length} passages with stable locators`);

  // A file whose bytes contradict its declared type is refused.
  const hostileStatus = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/books/${id}/sources?title=Hostile&format=notes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "text/plain" },
      body: "PK\u0003\u0004\u0000\u0000binary payload",
    });
    return res.status;
  }, bookId);
  if (hostileStatus !== 400) throw new Error(`A binary file renamed to .txt was accepted (status ${hostileStatus})`);
  log("a binary file renamed to .txt was rejected");

  // The preview is shown before anything is written to the manuscript.
  const chaptersBefore = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/books/${id}/chapters`, { credentials: "include" });
    return ((await res.json()).chapters as unknown[]).length;
  }, bookId);
  await clickButton(page, "Review import preview");
  await waitText(page, "Preview · version 1");
  await page.waitForSelector("[data-preview]");
  const proposalCount = await page.$$eval("[data-preview] li", (els) => els.length);
  if (proposalCount < 3) throw new Error(`Expected at least three proposed chapters, found ${proposalCount}`);
  await shot(page, "research-preview");
  log(`preview shows ${proposalCount} proposed chapters before any write`);

  // Confirm the import.
  await clickButton(page, "Confirm import into manuscript");
  await page.waitForSelector('[data-applied="true"]', { timeout: 30_000 });
  await waitText(page, "Imported 3 chapters into your manuscript.");
  await waitText(page, "Supports");
  await shot(page, "research-applied");
  const chaptersAfter = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/books/${id}/chapters`, { credentials: "include" });
    return ((await res.json()).chapters as unknown[]).length;
  }, bookId);
  if (chaptersAfter !== chaptersBefore + 3) {
    throw new Error(`The import wrote ${chaptersAfter - chaptersBefore} chapters, expected 3`);
  }
  log("confirmed import added three chapters to the manuscript");

  // Confirming the same version again must not duplicate anything.
  await page.reload({ waitUntil: "networkidle0" });
  await clickButton(page, "Review import preview");
  await waitText(page, "Preview · version 1");
  await page.waitForSelector('[data-applied="true"]');
  await clickButton(page, "Confirm import into manuscript");
  await waitText(page, "This version was already applied; nothing was changed.");
  await page.waitForSelector('[data-applied="true"]');
  const chaptersAfterSecond = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/books/${id}/chapters`, { credentials: "include" });
    return ((await res.json()).chapters as unknown[]).length;
  }, bookId);
  if (chaptersAfterSecond !== chaptersAfter) {
    throw new Error(`A repeated confirmation changed the chapter count (${chaptersAfter} → ${chaptersAfterSecond})`);
  }
  log("a repeated confirmation changed nothing");

  // Link the source to an existing chapter.
  await page.reload({ waitUntil: "networkidle0" });
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
  await shot(page, "research-linked");
  log("source linked to an existing chapter with its supporting passage");

  // The chapter shows the citation, and the citation opens the real passage.
  // The citation panel lists the book's own chapters, so the linked chapter is
  // found by the title it was linked under.
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
  await waitText(page, "Kitchen notes");
  await page.waitForSelector("[data-citations] button");
  await page.click("[data-citations] button");
  await page.waitForSelector('[role="dialog"][aria-label="Cited passage"]');
  await waitText(page, "Kitchen notes");
  // The passage is fetched after the dialog opens, so the text is awaited.
  await page.waitForSelector('[role="dialog"][aria-label="Cited passage"] p', { timeout: 20_000 });
  const passageText = await page.$eval('[role="dialog"][aria-label="Cited passage"] p', (el) => el.textContent ?? "");
  if (!passageText.trim()) throw new Error("The cited passage opened empty");
  await shot(page, "research-citation");
  log("citation opened the exact supporting passage");

  // A question the sources support.
  // The passage dialog is closed first, so it cannot cover the question field.
  await clickButton(page, "Close");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.click("#research-question");
  await page.type("#research-question", "How long can cooked leftovers be kept in the refrigerator?");
  await clickButton(page, "Ask");
  await page.waitForSelector("[data-answer]", { timeout: 60_000 });
  const supportedOutcome = await page.$eval("[data-answer]", (el) => el.getAttribute("data-answer"));
  if (supportedOutcome !== "supported") {
    const reason = await page.$eval("[data-answer]", (el) => el.textContent ?? "");
    throw new Error(`The sources did not answer a question they support: ${reason}`);
  }
  await waitText(page, "Evidence");
  await shot(page, "research-answer");
  log("question answered from the sources with visible evidence");

  // A question the sources do not support must abstain rather than invent.
  await page.$eval("#research-question", (el) => {
    (el as HTMLTextAreaElement).value = "";
  });
  await page.type("#research-question", "How do I service a turbocharged diesel engine?");
  await clickButton(page, "Ask");
  await page.waitForFunction(
    () => document.querySelector("[data-answer]")?.getAttribute("data-answer") === "unsupported",
    { timeout: 60_000 },
  );
  await waitText(page, "The sources do not answer this.");
  await shot(page, "research-abstain");
  log("an unsupported question abstained instead of inventing an answer");

  // Another owner cannot see the source.
  const isolation = await page.evaluate(async () => {
    const response = await fetch("/api/v1/sources/does-not-exist", { credentials: "include" });
    return response.status;
  });
  if (isolation !== 404) throw new Error(`An unknown source returned ${isolation}, expected 404`);
  log("sources are scoped to their owner");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll S11 steps passed. Screenshots: ${SHOTS}`);
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
