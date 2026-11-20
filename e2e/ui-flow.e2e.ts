/**
 * End-to-end UI journey (run against a live stack with AI_MOCK=1):
 * sign up → verify OTP (via Mailpit) → create book → approve outline → write
 * chapters → edit + autosave → AI assist → export PDF → credits.
 *
 *   BASE_URL=http://localhost:3000 MAILPIT_URL=http://localhost:8025 pnpm e2e
 */
import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/ebook-e2e";
const HEADLESS = process.env.HEADED ? false : true;
mkdirSync(SHOTS, { recursive: true });

const email = `e2e${Date.now()}@example.com`;
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
  const handle = await page.waitForSelector(`::-p-xpath(//button[contains(normalize-space(.), ${JSON.stringify(text)}) and not(@disabled)] | //a[contains(normalize-space(.), ${JSON.stringify(text)})])`, { timeout: 30_000 });
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

const browser = await puppeteer.launch({ headless: HEADLESS, args: ["--no-sandbox"], defaultViewport: { width: 1360, height: 900 } });
const page = await browser.newPage();
const consoleErrors: string[] = [];
const keyedRequests = new Set<string>();
page.on("request", (req) => {
  if (req.method() !== "POST" || !req.headers()["idempotency-key"]) return;
  const path = new URL(req.url()).pathname;
  if (path === "/api/v1/books") keyedRequests.add("create");
  if (/\/books\/[^/]+\/generate$/.test(path)) keyedRequests.add("write");
  if (/\/books\/[^/]+\/exports$/.test(path)) keyedRequests.add("export");
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && consoleErrors.push(m.text()));

try {
  // Landing
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await waitText(page, "publish-ready");
  await shot(page, "landing");
  log("landing page");

  // Protected route redirects to login
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "networkidle0" });
  if (!page.url().includes("/login")) throw new Error("Expected redirect to /login");
  log("unauthenticated /app redirects to /login");

  // Sign up
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await clickButton(page, "Create account");
  await waitText(page, "Please enter your name");
  log("signup validation messages");
  await page.type("#name", "E2E Tester");
  await page.type("#email", email);
  await page.type("#password", "password123");
  await shot(page, "signup");
  await clickButton(page, "Create account");
  await page.waitForFunction(() => location.pathname === "/verify-email", { timeout: 15_000 });
  log("signup → verify-email");

  // Verify OTP
  const otp = await getOtp(email);
  await page.waitForSelector('input[aria-label="Digit 1"]');
  await page.click('input[aria-label="Digit 1"]');
  await page.keyboard.type(otp, { delay: 40 });
  await page.waitForFunction(() => location.pathname === "/app/dashboard", { timeout: 20_000 });
  await waitText(page, "Welcome back");
  await waitText(page, "Your library is empty");
  await shot(page, "dashboard-empty");
  log("OTP verified, dashboard (empty state)");

  // Create a book (Bengali)
  await clickButton(page, "Create your first eBook");
  await page.waitForSelector("#topic");
  await clickButton(page, "Continue");
  await waitText(page, "Describe your idea in at least a few words");
  log("wizard validation");
  await page.type("#topic", "A beginner's guide to meal prep for busy parents");
  await page.waitForFunction(() => new Promise<boolean>(resolve => {
    const request = indexedDB.open('ebook-planning-drafts', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) { db.close(); resolve(false); return; }
      const tx = db.transaction('drafts', 'readonly');
      const rows = tx.objectStore('drafts').getAll();
      tx.oncomplete = () => { db.close(); resolve(rows.result.some((r: { topic?: string }) => r.topic === "A beginner's guide to meal prep for busy parents")); };
    };
    request.onerror = () => resolve(false);
  }));
  await page.reload({ waitUntil: 'networkidle0' });
  await clickButton(page, 'Recover brief');
  if (await page.$eval('#topic', el => (el as HTMLTextAreaElement).value) !== "A beginner's guide to meal prep for busy parents") throw new Error('Planning draft was not recovered');
  log('unfinished wizard recovers after reload');
  await shot(page, "wizard-step1");
  await clickButton(page, "Continue");
  await page.waitForSelector("#language");
  await page.select("#language", "bn");
  await clickButton(page, "Continue");
  await page.waitForSelector("#chapterCount");
  await waitText(page, "Estimated cost");
  await shot(page, "wizard-step3");
  await clickButton(page, "Create outline");
  await page.waitForFunction(() => location.pathname.endsWith("/outline"), { timeout: 20_000 });
  await page.waitForSelector("#book-title", { timeout: 30_000 });
  await shot(page, "outline");
  log("book created, outline generated");

  // Edit outline: rename chapter 1, then approve (saves first)
  const ch1 = await page.$('input[aria-label="Chapter 1 title"]');
  await ch1!.click({ count: 3 });
  await page.keyboard.type("Welcome to Meal Prep");
  await clickButton(page, "Approve outline");
  await page.waitForFunction(() => location.pathname.endsWith("/generate"), { timeout: 20_000 });
  log("outline edited + approved");

  // Write chapters
  await clickButton(page, "Write my book");
  await waitText(page, "Your book is written", 60_000);
  await shot(page, "written");
  log("chapters generated with live progress");
  await waitText(page, "Recent activity");
  await clickButton(page, "Copy support reference");
  await page.waitForFunction(() => document.body.innerText.includes("Reference copied") || document.body.innerText.includes("Support reference:"));
  if (!keyedRequests.has("create") || !keyedRequests.has("write")) throw new Error("Writing requests are missing durable request identities");
  log("operation activity and support reference");

  // Editor
  await clickButton(page, "Open editor");
  await page.waitForSelector(".book-prose", { timeout: 20_000 });
  await waitText(page, "Welcome to Meal Prep");
  await page.click(".book-prose p");
  await page.keyboard.press("End");
  await page.keyboard.type(" Added by the end-to-end test.");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === "History" && !b.disabled), { timeout: 15_000 });
  log("editor autosave");

  // Preview the pre-edit draft, restore it, then verify another edit saves cleanly.
  await clickButton(page, "History");
  await waitText(page, "Version history");
  await page.waitForSelector('dialog[open] button[aria-pressed="false"]');
  await page.click('dialog[open] button[aria-pressed="false"]');
  await page.waitForSelector("::-p-xpath(//dialog//button[normalize-space(.)='Restore this version' and not(@disabled)])");
  await shot(page, "version-history");
  await clickButton(page, "Restore this version");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  const restoredText = await page.$eval(".book-prose", (el) => el.textContent ?? "");
  if (restoredText.includes("Added by the end-to-end test.")) throw new Error("Restore did not replace the edited draft");
  await page.click(".book-prose p");
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited after restoring history.");
  await clickButton(page, "History"); // enabled only after autosave finishes
  await waitText(page, "Version history");
  await page.waitForSelector('dialog[open] button[aria-pressed="false"]');
  await page.waitForFunction(() => document.querySelectorAll('dialog[open] button[aria-pressed="false"]').length >= 3);
  await page.click('dialog[open] button[aria-label="Close"]');
  log("version preview, restore, and subsequent autosave");

  // Failed saves retain a durable browser draft; reload must not silently submit it.
  let rejectSaves = true;
  let patchAttempts = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.isInterceptResolutionHandled()) return;
    if (request.method() === 'PATCH' && /\/chapters\/[^/]+$/.test(new URL(request.url()).pathname)) {
      patchAttempts++;
      if (rejectSaves) { void request.abort('failed'); return; }
    }
    void request.continue();
  });
  await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).select());
  await page.type('input[aria-label="Chapter title"]', 'Recovered manuscript title');
  await waitText(page, 'Not saved');
  const failedAttempts = patchAttempts;
  await new Promise(r => setTimeout(r, 2600));
  if (patchAttempts !== failedAttempts) throw new Error('Failed save is retrying without permission');
  page.on('dialog', dialog => void dialog.accept());
  rejectSaves = false;
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText(page, 'Unsaved browser drafts found');
  await clickButton(page, 'Recover ');
  if (await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).value) !== 'Recovered manuscript title') throw new Error('Draft title lost on reload');
  await page.click("::-p-xpath(//button[normalize-space(.)='Save' and not(@disabled)])");
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'History' && !b.disabled));
  log('failed save pauses, draft survives reload, explicit recovery and manual save');

  // A concurrent server edit must produce one conflict and wait for a decision.
  const currentBookId = new URL(page.url()).pathname.split('/')[3];
  const concurrent = await page.evaluate(async bookId => {
    const list = await (await fetch(`/api/v1/books/${bookId}/chapters`)).json();
    const id = list.chapters[0].id;
    const current = await (await fetch(`/api/v1/chapters/${id}`)).json();
    const response = await fetch(`/api/v1/chapters/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: current.chapter.version, title: 'Changed in another tab' }) });
    return response.status;
  }, currentBookId);
  if (concurrent !== 200) throw new Error('Concurrent edit setup failed');
  await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).select());
  await page.type('input[aria-label="Chapter title"]', 'My reviewed title');
  await waitText(page, 'This chapter was changed elsewhere');
  const conflictedAttempts = patchAttempts;
  await new Promise(r => setTimeout(r, 2600));
  if (patchAttempts !== conflictedAttempts) throw new Error('Conflict is retrying without a decision');
  await clickButton(page, 'Keep my version');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'History' && !b.disabled));
  log('concurrent version conflict pauses and explicit keep-mine saves');

  await page.setOfflineMode(true);
  await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).select());
  await page.type('input[aria-label="Chapter title"]', 'Offline edits retained');
  await waitText(page, 'Offline — changes pending');
  await page.setOfflineMode(false);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'History' && !b.disabled));
  log('offline editing and reconnect save');

  const unavailableStorage = await page.evaluateOnNewDocument(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); };
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText(page, 'Browser recovery is unavailable');
  await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).select());
  await page.type('input[aria-label="Chapter title"]', 'Server saves without local storage');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'History' && !b.disabled));
  await page.removeScriptToEvaluateOnNewDocument(unavailableStorage.identifier);
  await page.reload({ waitUntil: 'networkidle0' });
  if (await page.$eval('input[aria-label="Chapter title"]', el => (el as HTMLInputElement).value) !== 'Server saves without local storage') throw new Error('Storage failure prevented server save');
  log('unavailable browser storage warns and server saving still works');

  // AI assist on a selection
  await page.evaluate(() => {
    const p = document.querySelector(".book-prose p")!;
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.waitForSelector("::-p-xpath(//button[normalize-space(.)='Shorten'])", { visible: true, timeout: 10_000 });
  await shot(page, "editor-bubble");
  await page.click("::-p-xpath(//button[normalize-space(.)='Shorten'])");
  await waitText(page, "Review the suggestion");
  await page.waitForSelector("::-p-xpath(//dialog//button[normalize-space(.)='Accept' and not(@disabled)])", { timeout: 15_000 });
  await shot(page, "ai-suggestion");
  await page.click("::-p-xpath(//dialog//button[normalize-space(.)='Accept'])");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === "History" && !b.disabled), { timeout: 15_000 });
  log("AI assist suggestion accepted");
  await shot(page, "editor");

  // Export
  await page.goto(`${page.url().replace(/\/editor$/, "/export")}`, { waitUntil: "networkidle0" });
  await waitText(page, 'Prepare for a marketplace');
  await waitText(page, 'Preparation needed');
  await page.select('select', 'etsy');
  await waitText(page, 'Choose a delivery file no larger than 20 MB');
  await clickButton(page, "Export PDF");
  await waitText(page, "Ready", 90_000);
  await waitText(page, "pages");
  await shot(page, "export");
  const href = await page.$eval('a[href*="/download"]', (a) => (a as HTMLAnchorElement).href);
  const pdf = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "include" });
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type"), head: String.fromCharCode(...b.slice(0, 5)), size: b.length };
  }, href);
  if (pdf.status !== 200 || pdf.head !== "%PDF-") throw new Error(`Bad PDF download: ${JSON.stringify(pdf)}`);
  if (!keyedRequests.has("export")) throw new Error("Export request is missing a durable request identity");
  await waitText(page, "Recent activity");
  await clickButton(page, 'Refresh checks');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('li')).some(li => li.textContent?.includes('Choose a delivery file no larger than 20 MB') && li.textContent?.includes('Passed:')));
  log('destination-specific publishing checks refresh after export');
  log(`PDF exported and downloaded (${pdf.size} bytes)`);

  // Restore earlier planning after writing, preserving the manuscript.
  const chapterList = await page.evaluate(async bookId => JSON.stringify(await (await fetch(`/api/v1/books/${bookId}/chapters`)).json()), currentBookId);
  await page.goto(`${BASE}/app/books/${currentBookId}/outline`, { waitUntil: 'networkidle0' });
  await clickButton(page, 'Outline history');
  await clickButton(page, 'Version 1');
  await clickButton(page, 'Restore this outline');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const afterPlanning = await page.evaluate(async bookId => JSON.stringify(await (await fetch(`/api/v1/books/${bookId}/chapters`)).json()), currentBookId);
  if (afterPlanning !== chapterList) throw new Error('Outline restore changed the manuscript');
  log('outline history restores planning without changing written chapters');

  await page.goto(`${BASE}/app/projects`, { waitUntil: 'networkidle0' });
  await clickButton(page, 'New project');
  await page.type('input[aria-label="Project name"]', 'Marketplace series');
  await page.type('textarea[aria-label="Project description"]', 'Books prepared for digital stores');
  await clickButton(page, 'Save project');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await waitText(page, 'Marketplace series');
  const projectHref = await page.$eval('a[href*="projectId="]', el => (el as HTMLAnchorElement).href);
  const projectId = new URL(projectHref).searchParams.get('projectId')!;
  await clickButton(page, 'Edit project');
  await page.$eval('input[aria-label="Project name"]', el => (el as HTMLInputElement).select());
  await page.type('input[aria-label="Project name"]', 'Digital publishing series');
  await clickButton(page, 'Save project');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.goto(`${BASE}/app/books`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('select[aria-label^="Project for "] option[value="' + projectId + '"]');
  await page.select('select[aria-label^="Project for "]', projectId);
  await page.waitForFunction(id => (document.querySelector('select[aria-label^="Project for "]') as HTMLSelectElement)?.value === id && !(document.querySelector('select[aria-label^="Project for "]') as HTMLSelectElement)?.disabled, {}, projectId);
  await page.select('select[aria-label="Project filter"]', projectId);
  await page.waitForFunction(id => new URL(location.href).searchParams.get('projectId') === id, {}, projectId);
  await clickButton(page, 'Archive book');
  await waitText(page, 'No books match');
  await page.select('select[aria-label="Archive filter"]', 'archived');
  await clickButton(page, 'Restore book');
  await waitText(page, 'No books match');
  await page.select('select[aria-label="Archive filter"]', '');
  await clickButton(page, 'Duplicate');
  await clickButton(page, 'Include manuscript');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await clickButton(page, 'Clear filters');
  await page.waitForFunction(() => document.querySelectorAll('select[aria-label^="Project for "]').length === 2);
  log('project create/edit, assignment, URL filters, book archive/restore and manuscript duplication');

  // Credits
  await page.goto(`${BASE}/app/credits`, { waitUntil: "networkidle0" });
  await waitText(page, "History");
  await shot(page, "credits");
  log("credits ledger");

  // Mobile layout
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: "networkidle0" });
  await waitText(page, "Recent eBooks");
  await shot(page, "mobile-dashboard");
  log("mobile dashboard");

  if (consoleErrors.length) {
    console.warn("\nBrowser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  }
  console.log(`\nAll steps passed. Screenshots: ${SHOTS}`);
} catch (err) {
  await shot(page, "FAILURE").catch(() => undefined);
  console.error(`\n✗ Failed at step ${step}: ${(err as Error).message}`);
  if (consoleErrors.length) console.error("Browser console errors:\n" + consoleErrors.map((e) => `  - ${e}`).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
