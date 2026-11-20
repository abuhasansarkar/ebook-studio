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

/** Waits for an element to exist. The report panel renders a loader until its detail arrives. */
async function waitFor(page: Page, selector: string, timeout = 30_000) {
  await page.waitForSelector(selector, { timeout });
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

  // Upload through the picker, describe, insert, reload and enforce deletion protection.
  await page.click('.book-prose');
  await page.keyboard.press('Escape');
  await clickButton(page, 'Images');
  const imageBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#cc6633'; ctx.fillRect(0, 0, 96, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const imagePath = `${SHOTS}/asset-upload.png`;
  const { writeFileSync } = await import('node:fs'); writeFileSync(imagePath, Buffer.from(imageBytes, 'base64'));
  const fileInput = await page.$('dialog input[type="file"]'); await fileInput!.uploadFile(imagePath);
  await waitText(page, 'Not yet saved in a manuscript');
  await page.type('dialog article input', 'Warm orange illustration');
  await page.type('dialog article textarea', 'A caption for the illustrated chapter');
  await clickButton(page, 'Save details'); await waitText(page, 'Details saved.');
  await clickButton(page, 'Insert image');
  await page.waitForSelector('.book-prose img[alt="Warm orange illustration"]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'History' && !b.disabled));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const image = document.querySelector('.book-prose img[alt="Warm orange illustration"]') as HTMLImageElement | null;
    return !!image?.complete && image.naturalWidth > 0;
  });
  await clickButton(page, 'Images'); await waitText(page, 'Retained for manuscript history');
  if (!await page.$eval('dialog article button:last-child', el => (el as HTMLButtonElement).disabled)) throw new Error('Referenced image deletion was enabled');
  await page.click('dialog button[aria-label="Close"]');
  log('private upload, metadata, chapter insertion, persisted preview and deletion protection');

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

  // Cover artwork is generated separately from editable, recoverable typography.
  await page.goto(`${BASE}/app/books/${currentBookId}/cover`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('textarea[aria-label="title text"]:not(:disabled)');
  await page.$eval('textarea[aria-label="title text"]', el => (el as HTMLTextAreaElement).select());
  await page.type('textarea[aria-label="title text"]', 'একটি ব্যবহারিক বই');
  await clickButton(page, 'Save cover'); await waitText(page, 'Cover saved as version 1');
  await page.type('textarea[aria-label="Artwork prompt"]', 'An editorial landscape with warm colors and room for a title');
  await clickButton(page, 'Generate image'); await waitText(page, 'cover · completed', 60000);
  await clickButton(page, 'Use as cover artwork'); await clickButton(page, 'Save cover'); await waitText(page, 'Cover saved as version 2');
  const creditBeforeText = await page.evaluate(async () => (await (await fetch('/api/v1/credits')).json()).wallet.balance);
  await page.$eval('textarea[aria-label="title text"]', el => (el as HTMLTextAreaElement).select());
  await page.type('textarea[aria-label="title text"]', 'নতুন বইয়ের প্রচ্ছদ');
  await clickButton(page, 'Undo');
  if (await page.$eval('textarea[aria-label="title text"]', el => (el as HTMLTextAreaElement).value) === 'নতুন বইয়ের প্রচ্ছদ') throw new Error('Cover undo did not change the draft');
  await clickButton(page, 'Redo');
  await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, 'Unsaved cover draft found');
  await clickButton(page, 'Recover cover draft');
  if (await page.$eval('textarea[aria-label="title text"]', el => (el as HTMLTextAreaElement).value) !== 'নতুন বইয়ের প্রচ্ছদ') throw new Error('Cover recovery lost typography');
  await clickButton(page, 'Save cover'); await waitText(page, 'Cover saved as version 3');
  const creditAfterText = await page.evaluate(async () => (await (await fetch('/api/v1/credits')).json()).wallet.balance);
  if (creditAfterText !== creditBeforeText) throw new Error('Typography changes spent image credits');
  await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, 'Saved version 3');
  await clickButton(page, 'Download cover JPG'); await waitText(page, 'Downloaded the saved 1600 × 2560 cover.');
  const renderedCover = await page.evaluate(async bookId => {
    const r = await fetch(`/api/v1/books/${bookId}/cover/render?version=3`); if (!r.ok) throw new Error('Cover download failed');
    const blob = await r.blob(); const bitmap = await createImageBitmap(blob);
    const dataUrl = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
    return { width: bitmap.width, height: bitmap.height, type: blob.type, dataUrl };
  }, currentBookId);
  if (renderedCover.width !== 1600 || renderedCover.height !== 2560 || renderedCover.type !== 'image/jpeg') throw new Error('Invalid composed cover dimensions');
  writeFileSync(`${SHOTS}/cover-bengali.jpg`, Buffer.from(renderedCover.dataUrl.split(',')[1], 'base64'));
  await page.evaluate(async bookId => {
    const latest = (await (await fetch(`/api/v1/books/${bookId}/cover`)).json()).cover;
    latest.data.title.text = 'Another tab title';
    const response = await fetch(`/api/v1/books/${bookId}/cover`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: latest.version, data: latest.data }) });
    if (!response.ok) throw new Error('External cover update failed');
  }, currentBookId);
  await page.$eval('textarea[aria-label="title text"]', el => (el as HTMLTextAreaElement).select());
  await page.type('textarea[aria-label="title text"]', 'আমার বইয়ের প্রচ্ছদ');
  await clickButton(page, 'Save cover'); await waitText(page, 'The cover changed in another tab');
  await clickButton(page, 'Keep draft and review latest version'); await waitText(page, 'Latest saved text (version 4)'); await waitText(page, 'Another tab title');
  await clickButton(page, 'Save cover'); await waitText(page, 'Cover saved as version 5');
  await page.select('select[aria-label="Image purpose"]', 'illustration');
  await page.select('select[aria-label="Image aspect"]', 'square');
  await page.type('textarea[aria-label="Artwork prompt"]', 'A simple illustration of a reading desk with a book');
  await clickButton(page, 'Generate image'); await waitText(page, 'illustration · completed', 60000);
  log('cover generation, editable typography without extra charges, undo/redo, recovery, reopen, Bengali JPG and interior illustration');

  // Interior design (S08): preview a template before applying, apply + undo, edit matter, reload, reader/print previews, conflicts, design-aware export.
  const designApi = (bookId: string) => page.evaluate(async id => (await (await fetch(`/api/v1/books/${id}/design`)).json()).design as { version: number; data: { print: { trim: string }; matter: { dedication: { text: string } } } }, bookId);
  const readerText = () => page.evaluate(() => (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement | null)?.contentDocument?.body?.innerText ?? '');
  await page.goto(`${BASE}/app/books/${currentBookId}/design`, { waitUntil: 'networkidle0' });
  await waitText(page, 'Default design (not saved yet)');
  await page.waitForFunction(() => (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement | null)?.contentDocument?.body?.innerText.includes('সূচিপত্র'), { timeout: 30000 });
  await clickButton(page, 'Preview Classic'); await waitText(page, 'Applying changes'); await waitText(page, 'Classic template (not applied)');
  if ((await designApi(currentBookId)).version !== 0) throw new Error('Template preview persisted a design');
  await clickButton(page, 'Apply Classic'); await waitText(page, 'Applied Classic as version 1');
  if ((await designApi(currentBookId)).data.print.trim !== '5.5x8.5') throw new Error('Classic template trim was not applied');
  await clickButton(page, 'Undo template'); await waitText(page, 'Template undone.');
  if ((await designApi(currentBookId)).data.print.trim !== '6x9') throw new Error('Template undo did not restore the earlier design');
  await clickButton(page, 'Apply Classic'); await waitText(page, 'Applied Classic as version 3');
  await clickButton(page, 'Matter');
  await page.click('#dedication-enabled');
  // An included dedication needs text: the field explains why and Save stays disabled.
  await page.waitForSelector('#dedication-text'); await waitText(page, 'Add text or turn this section off');
  const saveDisabled = await page.$$eval('button', buttons => buttons.find(b => b.textContent?.trim() === 'Save design')?.disabled);
  if (!saveDisabled) throw new Error('Save was enabled for an empty required dedication');
  await page.type('#dedication-text', 'রবিবারে যাঁরা রান্না করেন, তাঁদের জন্য');
  await clickButton(page, 'Save design'); await waitText(page, 'Design saved as version 4');
  await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, 'Saved version 4');
  if ((await designApi(currentBookId)).data.matter.dedication.text !== 'রবিবারে যাঁরা রান্না করেন, তাঁদের জন্য') throw new Error('Dedication did not persist');
  await page.waitForFunction(() => (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement | null)?.contentDocument?.body?.innerText.includes('রবিবারে যাঁরা রান্না করেন'), { timeout: 30000 });
  const readerCss = await page.evaluate(() => Array.from((document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement).contentDocument!.querySelectorAll('style')).map(s => s.textContent).join(''));
  if (/@page|counter\(page\)/.test(readerCss)) throw new Error('Print-only rules leaked into the reader preview');
  if (!(await readerText()).includes('অধ্যায়')) throw new Error('Localized chapter label missing from reader preview');
  await clickButton(page, 'Tablet');
  await page.waitForFunction(() => (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement).style.width === '768px' && document.body.innerText.includes('768 px wide, shown at'));
  await page.click('button[aria-label="Larger reader text"]');
  await page.waitForFunction(() => (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement).contentDocument?.documentElement.style.getPropertyValue('--reader-scale') === '1.1');
  const fontsLoaded = await page.evaluate(() => { const d = (document.querySelector('iframe[title="Reader preview"]') as HTMLIFrameElement).contentDocument!; return d.fonts.ready.then(() => Array.from(d.fonts as unknown as Iterable<FontFace>).filter(f => f.status === 'loaded').map(f => f.family)); });
  if (!fontsLoaded.some(f => f.includes('Noto Serif Bengali'))) throw new Error(`Bundled Bengali font did not load in the reader preview: ${fontsLoaded.join(', ')}`);
  await shot(page, 'design-reader');
  await page.setViewport({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, 'Saved version 4'); await shot(page, 'design-mobile'); await page.setViewport({ width: 1360, height: 900 }); await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, 'Saved version 4');
  await clickButton(page, 'Print sample (PDF)');
  await clickButton(page, 'Render print sample'); await waitText(page, ' pages · ', 60000);
  await page.waitForSelector('iframe[title="Print sample PDF"][src^="blob:"]');
  await shot(page, 'design-print');
  const printSample = await page.evaluate(async bookId => {
    const r = await fetch(`/api/v1/books/${bookId}/design/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'print' }) });
    return { ok: r.ok, type: r.headers.get('content-type'), fallback: r.headers.get('x-fallback-fonts'), type3: r.headers.get('x-type3-fonts'), text: await r.text() };
  }, currentBookId);
  if (!printSample.ok || !printSample.type?.includes('pdf') || printSample.fallback !== '' || printSample.type3 !== '' || !/\/MediaBox \[0 0 396 612\]/.test(printSample.text)) throw new Error('Print sample was not a clean 5.5 × 8.5 in PDF');
  // A second tab saves first: the stale save must not overwrite it, and the local draft survives review.
  await page.evaluate(async bookId => {
    const latest = (await (await fetch(`/api/v1/books/${bookId}/design`)).json()).design;
    latest.data.matter.dedication.text = 'Another tab dedication';
    const r = await fetch(`/api/v1/books/${bookId}/design`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: latest.version, data: latest.data }) });
    if (!r.ok) throw new Error('External design update failed');
  }, currentBookId);
  await clickButton(page, 'Print layout');
  await page.select('#trim', '6x9');
  await clickButton(page, 'Save design'); await waitText(page, 'This design was changed elsewhere');
  await clickButton(page, 'Keep my draft and review latest'); await waitText(page, 'Your draft is kept on top of version 5');
  if (await page.$eval('#trim', el => (el as HTMLSelectElement).value) !== '6x9') throw new Error('Conflict review lost the local design draft');
  await clickButton(page, 'Save design'); await waitText(page, 'Design saved as version 6');
  await page.goto(`${BASE}/app/books/${currentBookId}/export`, { waitUntil: 'networkidle0' });
  await clickButton(page, 'Export PDF');
  await waitText(page, 'design v6', 60000); await waitText(page, 'Bundled fonts only', 90000);
  await shot(page, 'design-export');
  log('interior design: template preview/apply/undo, matter save + reload, reader widths/text size, bundled Bengali fonts, real print sample, conflict review and design-aware export');

  // Quality review (S09): free checks, anchored findings, editor highlight, terminology fix as a normal edit, review notes, stale reports, costed AI review.
  const clickSummary = (text: string) => page.evaluate(t => { const el = Array.from(document.querySelectorAll('summary')).find(s => s.textContent?.includes(t)) as HTMLElement | undefined; if (!el) throw new Error(`No summary ${t}`); el.click(); }, text);
  const cardLink = (text: string) => page.evaluate(t => Array.from(document.querySelectorAll('article')).find(a => a.textContent?.includes(t))?.querySelector('a')?.getAttribute('href') ?? null, text);
  const seededChapter = await page.evaluate(async bookId => {
    const list = (await (await fetch(`/api/v1/books/${bookId}/chapters`)).json()).chapters;
    const chapter = (await (await fetch(`/api/v1/chapters/${list[0].id}`)).json()).chapter;
    chapter.contentJson.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'TODO: এখানে একটি উদাহরণ যোগ করুন।' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'ফ্রিজ পরিষ্কার রাখুন। ফ্রিজারে খাবার রাখুন।' }] });
    const r = await fetch(`/api/v1/chapters/${chapter.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: chapter.version, contentJson: chapter.contentJson }) });
    if (!r.ok) throw new Error(`Seeding the review fixture failed: ${r.status} ${await r.text()}`);
    const after = (await (await fetch(`/api/v1/chapters/${chapter.id}`)).json()).chapter;
    const persisted = JSON.stringify(after.contentJson);
    if (!persisted.includes('ফ্রিজ')) throw new Error('Seed did not persist the review fixture');
    return chapter.id as string;
  }, currentBookId);
  await page.goto(`${BASE}/app/books/${currentBookId}/quality`, { waitUntil: 'networkidle0' });
  await waitText(page, 'No reviews yet');
  await clickButton(page, 'Run checks (free)'); await waitText(page, 'Checks finished.');
  await waitFor(page, '#f-category');
  await page.select('#f-category', 'content');
  await waitText(page, 'Placeholder marker left in the text.');
  await shot(page, 'quality-report');
  const placeholderHref = await cardLink('Placeholder marker');
  if (!placeholderHref?.includes(`chapter=${seededChapter}`) || !placeholderHref.includes('finding=')) throw new Error(`Finding link does not target the chapter: ${placeholderHref}`);
  await page.goto(`${BASE}${placeholderHref}`, { waitUntil: 'networkidle0' });
  await waitText(page, 'The passage is highlighted');
  if (await page.$eval('[data-finding-highlight]', el => el.textContent) !== 'TODO') throw new Error('Editor did not highlight the anchored text');
  await shot(page, 'quality-editor-highlight');
  await clickButton(page, 'Mark resolved'); await waitText(page, 'Marked as resolved.');
  // Add a terminology rule; the existing report becomes out of date.
  await page.goto(`${BASE}/app/books/${currentBookId}/quality`, { waitUntil: 'networkidle0' });
  await clickSummary('Voice and terminology');
  await clickButton(page, 'Add term');
  await page.type('#t-pref-0', 'ফ্রিজার'); await page.type('#t-avoid-0', 'ফ্রিজ');
  await clickButton(page, 'Save voice and terminology'); await waitText(page, 'Voice and terminology (version 1)');
  await waitText(page, 'Out of date');
  await clickButton(page, 'Run checks again'); await waitText(page, 'Checks finished.');
  await waitFor(page, '#f-category');
  await page.select('#f-category', 'consistency'); await waitText(page, 'Use “ফ্রিজার” instead of “ফ্রিজ”');
  const termCards = await page.evaluate(() => Array.from(document.querySelectorAll('article')).filter(a => a.textContent?.includes('instead of “ফ্রিজ”')).length);
  if (termCards !== 1) throw new Error(`Expected one whole-word terminology finding, found ${termCards}`);
  await page.goto(`${BASE}${await cardLink('instead of “ফ্রিজ”')}`, { waitUntil: 'networkidle0' });
  await clickButton(page, 'Replace with “ফ্রিজার”'); await waitText(page, 'Replacement applied');
  // The replacement is saved by autosave; wait for it to reach the server before editing the chapter again.
  await page.waitForFunction(async id => {
    const c = (await (await fetch(`/api/v1/chapters/${id}`)).json()).chapter;
    return JSON.stringify(c.contentJson).includes('ফ্রিজার পরিষ্কার রাখুন');
  }, { timeout: 30000, polling: 500 }, seededChapter);
  // A definition the chapter contradicts must be reported under Contradictions.
  await page.goto(`${BASE}/app/books/${currentBookId}/quality`, { waitUntil: 'networkidle0' });
  await clickSummary('Voice and terminology');
  await clickButton(page, 'Add definition');
  await page.type('#d-term-0', 'batch cooking'); await page.type('#d-def-0', 'cooking several meals at once');
  await clickButton(page, 'Save voice and terminology');
  await waitText(page, 'Voice and terminology (version 2)');
  await page.evaluate(async id => {
    const c = (await (await fetch(`/api/v1/chapters/${id}`)).json()).chapter;
    if (!c.contentJson?.content) throw new Error('Chapter content is empty; nothing to extend');
    c.contentJson.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Batch cooking means preparing every ingredient before you begin.' }] });
    const r = await fetch(`/api/v1/chapters/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: c.version, contentJson: c.contentJson }) });
    if (!r.ok) throw new Error(`Seeding the contradiction fixture failed: ${r.status} ${await r.text()}`);
  }, seededChapter);
  await clickButton(page, 'Run checks again'); await waitText(page, 'Checks finished.');
  // The report panel (and its filters) can unmount while the report list reloads.
  await waitFor(page, '#f-category');
  await page.select('#f-category', 'contradiction'); await waitText(page, 'differently from your book context');
  await shot(page, 'quality-contradiction');
  // Dismissal needs a note and keeps attribution.
  await page.goto(`${BASE}/app/books/${currentBookId}/quality`, { waitUntil: 'networkidle0' });
  await page.select('#f-status', ''); await page.select('#f-category', 'content');
  await page.evaluate(() => { const card = Array.from(document.querySelectorAll('article')).find(a => a.textContent?.includes('Placeholder marker') && a.textContent.includes('Dismiss…')); (Array.from(card!.querySelectorAll('button')).find(b => b.textContent?.includes('Dismiss…')) as HTMLButtonElement).click(); });
  await page.waitForSelector('textarea[id^="note-"]');
  await page.type('textarea[id^="note-"]', 'The example is added in the next chapter.');
  await clickButton(page, 'Dismiss finding'); await waitText(page, 'Dismissed by E2E Tester');
  // Costed AI review of one chapter (mock provider).
  await clickSummary('AI review (optional');
  await page.evaluate(() => { const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')); boxes.slice(1).forEach(b => { if (b.checked) b.click(); }); });
  const creditsBeforeReview = await page.evaluate(async () => (await (await fetch('/api/v1/credits')).json()).wallet.balance);
  await clickButton(page, 'Start AI review'); await waitText(page, 'AI suggestions', 60000);
  await waitText(page, 'was discarded because its quote was not found');
  const creditsAfterReview = await page.evaluate(async () => (await (await fetch('/api/v1/credits')).json()).wallet.balance);
  const perChapter = await page.evaluate(async () => (await (await fetch('/api/v1/quality/config')).json()).creditsPerChapter);
  if (creditsBeforeReview - creditsAfterReview !== perChapter) throw new Error(`AI review charged ${creditsBeforeReview - creditsAfterReview}, expected ${perChapter}`);
  await shot(page, 'quality-ai');
  log('quality review: anchored checks, editor highlight, resolve, terminology replacement as a normal saved edit, attributed dismissal, stale report, definition contradiction and costed AI review');

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
