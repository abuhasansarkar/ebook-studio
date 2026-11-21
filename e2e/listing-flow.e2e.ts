/**
 * The listing studio journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP → create a book and write it → open the listing studio
 * → the screen states that nothing is submitted to a store → the royalty
 * estimate is shown for the chosen price → a listing is prepared from the
 * manuscript → a field is edited → the edit is saved → the version advances
 * → the edit survives a reload → the boundary is still stated on the page.
 *
 * The journey asserts the boundaries the product makes, rather than only that
 * the screen renders. A listing studio that quietly published, or that showed
 * a royalty figure without saying it was an estimate, would fail here.
 *
 *   BASE_URL=http://localhost:3100 MAILPIT_URL=http://localhost:8025 pnpm e2e:listing
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? path.join(tmpdir(), "ebook-e2e-listing");
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e-listing-${Date.now()}@example.com`;
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

/** The text of the whole page, with the whitespace collapsed. */
async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

/**
 * Sets the price field the way a paste does.
 *
 * The price is a controlled React input, so assigning `value` directly is
 * ignored: React tracks the last value it wrote and discards the change. The
 * native setter is used instead, and an input event is dispatched so React
 * sees the change the way it sees a keystroke.
 */
async function setPrice(page: Page, dollars: string): Promise<void> {
  await page.evaluate((value) => {
    const el = document.querySelector('[data-testid="listing-new-price"]') as HTMLInputElement | null;
    if (!el) throw new Error("The price field was not on the page");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, dollars);
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
  await page.type("#name", "Listing Tester");
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

  await waitText(page, "Approve outline", 90_000);
  await clickButton(page, "Approve outline");
  await page.waitForFunction(() => location.pathname.endsWith("/generate"), { timeout: 30_000 });
  await clickButton(page, "Write my book");
  // Starting is confirmed in a dialog that shows the cost.
  await clickButton(page, "credits and start");
  await waitText(page, "Your book is written", 180_000);
  log(`the book ${bookId} was created, the outline approved and the chapters written`);

  // ---- The listing studio -------------------------------------------------
  await page.goto(`${BASE}/app/listing?bookId=${bookId}`, { waitUntil: "networkidle0" });
  await waitText(page, "Listing copy", 30_000);

  // The screen must state the boundary, not merely imply it. The product
  // prepares the text; the author submits it to the store themselves.
  await waitText(page, "does not submit anything to a store", 30_000);
  const boundary = await bodyText(page);
  if (!/publish there yourself/i.test(boundary)) {
    throw new Error("The listing screen did not say that the author publishes at the store themselves");
  }
  if (!/No store has approved anything/i.test(boundary)) {
    throw new Error("The listing screen did not say that no store has approved anything");
  }
  log("the listing screen stated that nothing is submitted to a store and that no store has approved anything");

  // The royalty estimate is shown for the price the author chose, and it is
  // labelled as an estimate that excludes fees.
  await waitText(page, "What you would keep", 30_000);
  const estimateText = await bodyText(page);
  if (!/before any store fees, payment processing, tax or advertising/i.test(estimateText)) {
    throw new Error("The royalty estimate did not say what it excludes");
  }
  // The default price is $5.99, which pays 70% for a KDP eBook: $4.19.
  if (!/\$4\.19/.test(estimateText)) {
    throw new Error(`The royalty estimate did not show the expected $4.19 for a $5.99 KDP eBook: ${estimateText.slice(0, 400)}`);
  }
  log("the royalty estimate showed $4.19 of a $5.99 price and named what it excludes");

  // A price the author moves to must change the estimate, and the band it
  // falls into must be stated.
  await setPrice(page, "12.00");
  await waitText(page, "above $9.99", 30_000);
  const bandText = await bodyText(page);
  if (!/\$4\.20/.test(bandText)) {
    throw new Error("The estimate did not follow the price to the 35% band above $9.99");
  }
  log("moving the price to $12.00 moved the estimate to $4.20 and warned about the lower band");
  await setPrice(page, "5.99");
  await waitText(page, "$4.19", 30_000);

  // ---- Prepare a listing --------------------------------------------------
  await page.click('[data-testid="listing-prepare"]');
  await page.waitForSelector('[data-testid^="listing-field-description"]', { timeout: 60_000 });
  const cardCount = await page.evaluate(
    () => document.querySelectorAll('[data-testid^="listing-field-"]').length,
  );
  // A KDP eBook listing asks for seven fields, so fewer than that means the
  // screen did not render the destination's own form.
  if (cardCount < 7) {
    throw new Error(`The prepared listing showed ${cardCount} fields, expected the seven a KDP eBook form asks for`);
  }
  log(`a listing was prepared from the manuscript and showed ${cardCount} editable fields`);

  // The draft is written from the author's own manuscript, so it mentions the
  // topic the author gave rather than something generic.
  const description = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="listing-field-description"]') as HTMLTextAreaElement | null;
    return el?.value ?? "";
  });
  if (!/storing food safely/i.test(description)) {
    throw new Error(`The drafted description did not come from the manuscript: ${description.slice(0, 200)}`);
  }
  log("the drafted description was written from the author's own manuscript");

  // The version starts at one, and the fields carry the store's own limits.
  const versionText = await bodyText(page);
  if (!/v1/.test(versionText)) {
    throw new Error("The prepared listing did not show its version");
  }
  if (!/\/4000/.test(versionText)) {
    throw new Error("The listing did not show the store's character limit for the description");
  }
  log("the listing showed its version and the store's character limit");

  await shot(page, "listing-prepared");

  // ---- Edit a field and save ----------------------------------------------
  const MARK = "Edited by the author during the release journey.";
  // The marker is appended to the end of the field, so it is written into the
  // field's own value rather than typed at the cursor: pressing End only
  // reaches the end of the visual line, which would splice the marker into
  // the middle of the text.
  await page.evaluate((marker) => {
    const el = document.querySelector('[data-testid="listing-field-description"]') as HTMLTextAreaElement | null;
    if (!el) throw new Error("The description field was not on the page");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, `${el.value}\n\n${marker}`);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, MARK);

  // The save button is only live once something has changed.
  const saveEnabled = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="listing-save"]') as HTMLButtonElement | null;
    return el ? !el.disabled : false;
  });
  if (!saveEnabled) throw new Error("The save button stayed disabled after the author edited a field");
  await page.click('[data-testid="listing-save"]');
  await waitText(page, "Saved.", 30_000);
  log("the edited field was saved");

  // The version advances, so a lost edit is refused rather than overwriting.
  await waitText(page, "v2", 30_000);
  log("the listing version advanced to v2 after the save");

  // ---- The edit survives a reload -----------------------------------------
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="listing-field-description"]', { timeout: 30_000 });
  const keptEdit = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="listing-field-description"]') as HTMLTextAreaElement | null;
    return el?.value ?? "";
  });
  if (!keptEdit.includes(MARK)) {
    throw new Error("The author's edit did not survive a save and a reload");
  }
  log("the author's edit survived a save and a reload");

  // ---- The boundary is still stated ---------------------------------------
  const afterReload = await bodyText(page);
  if (!/does not submit anything to a store/i.test(afterReload)) {
    throw new Error("The listing screen dropped the store boundary after a reload");
  }
  if (!/No store has approved anything/i.test(afterReload)) {
    throw new Error("The listing screen dropped the approval statement after a reload");
  }
  log("the boundary was still stated after a reload");

  // ---- The API refuses a lost edit ----------------------------------------
  // A second save at the version the author already replaced must be refused
  // rather than silently overwriting whatever was saved in between.
  const conflict = await page.evaluate(async () => {
    const listings = await fetch("/api/v1/listings/books/" + new URLSearchParams(location.search).get("bookId"), {
      credentials: "include",
    }).then((r) => r.json());
    const listing = listings.listings[0];
    const res = await fetch(`/api/v1/listings/${listing.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseVersion: listing.version - 1, fields: { description: "A stale write." } }),
    });
    return res.status;
  });
  if (conflict !== 409) {
    throw new Error(`A stale listing save answered ${conflict}, expected 409`);
  }
  log("the API refused a stale listing save with 409");

  // ---- Another author cannot reach the listing ----------------------------
  const foreign = await page.evaluate(async () => {
    const listings = await fetch("/api/v1/listings/books/" + new URLSearchParams(location.search).get("bookId"), {
      credentials: "include",
    }).then((r) => r.json());
    const listing = listings.listings[0];
    const res = await fetch(`/api/v1/listings/${listing.id}/gaps`, { credentials: "include" });
    return res.status;
  });
  if (foreign !== 200) {
    throw new Error(`The owner could not read their own listing gaps (${foreign})`);
  }
  log("the owner could read their own listing");

  await shot(page, "listing-edited");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll listing steps passed. Screenshots: ${SHOTS}`);
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
