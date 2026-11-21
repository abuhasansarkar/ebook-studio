/**
 * Builds the Postman collection for the eBookStudio API.
 *
 * The collection is generated rather than hand-written so it stays in step
 * with the routes: every endpoint below was read from the backend source and
 * carries the use case it serves, the permission it needs and the shape of
 * the body it accepts.
 *
 * Run it with: node api/postman/build-collection.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "ebook-studio-api.postman_collection.json");

/** Collection-level variables. Override `baseUrl` for a different host. */
const variables = [
  { key: "baseUrl", value: "http://localhost:4000", type: "string" },
  { key: "apiBase", value: "{{baseUrl}}/api/v1", type: "string" },
  { key: "accessToken", value: "", type: "string" },
  { key: "bookId", value: "", type: "string" },
  { key: "chapterId", value: "", type: "string" },
  { key: "jobId", value: "", type: "string" },
  { key: "outlineVersion", value: "1", type: "string" },
  { key: "chapterVersion", value: "0", type: "string" },
  { key: "sourceId", value: "", type: "string" },
  { key: "sourceVersion", value: "1", type: "string" },
  { key: "passageLocator", value: "p1", type: "string" },
  { key: "listingId", value: "", type: "string" },
  { key: "listingVersion", value: "1", type: "string" },
  { key: "marketingDraftId", value: "", type: "string" },
  { key: "marketingGraphicId", value: "", type: "string" },
  { key: "marketingSampleId", value: "", type: "string" },
  { key: "packageId", value: "", type: "string" },
  { key: "exportId", value: "", type: "string" },
  { key: "assetId", value: "", type: "string" },
  { key: "coverVersion", value: "1", type: "string" },
  { key: "designVersion", value: "1", type: "string" },
  { key: "reportId", value: "", type: "string" },
  { key: "findingId", value: "", type: "string" },
  { key: "imageJobId", value: "", type: "string" },
  { key: "qualityJobId", value: "", type: "string" },
  { key: "operationId", value: "", type: "string" },
  { key: "supportRequestId", value: "", type: "string" },
  { key: "backupName", value: "", type: "string" },
  { key: "paymentId", value: "", type: "string" },
  { key: "planId", value: "", type: "string" },
  { key: "checkoutSession", value: "", type: "string" },
  { key: "userId", value: "", type: "string" },
];

/**
 * Builds one request.
 *
 * `use` is the customer-facing use case: why a person would call this.
 * `guard` is what the API enforces before it answers.
 */
function req(method, path, { name, use, guard, body, params, headers, raw, response, bodyLanguage } = {}) {
  const url = {
    raw: `{{apiBase}}${path}`,
    host: ["{{apiBase}}"],
    path: path.split("/").filter(Boolean),
  };
  if (params?.length) {
    url.query = params.map(p => ({ key: p.key, value: p.value ?? "", description: p.description }));
  }
  const request = { method, header: [], url, description: use };
  if (body) {
    request.header.push({ key: "Content-Type", value: "application/json" });
    request.body = {
      mode: "raw",
      raw: typeof body === "string" ? body : JSON.stringify(body, null, 2),
      options: { raw: { language: bodyLanguage ?? "json" } },
    };
  }
  for (const h of headers ?? []) request.header.push(h);
  const out = { name, request };
  if (guard) out.request.description = `${use}\n\nGuard: ${guard}`;
  if (response) out.response = response;
  return out;
}

/** A GET that needs no body. */
const get = (path, name, use, guard, extra = {}) =>
  req("GET", path, { name, use, guard, ...extra });

/** A GET with query parameters. */
const getQ = (path, name, use, guard, params, extra = {}) =>
  req("GET", path, { name, use, guard, params, ...extra });

const post = (path, name, use, guard, body, extra = {}) =>
  req("POST", path, { name, use, guard, body, ...extra });

const put = (path, name, use, guard, body, extra = {}) =>
  req("PUT", path, { name, use, guard, body, ...extra });

const patch = (path, name, use, guard, body, extra = {}) =>
  req("PATCH", path, { name, use, guard, body, ...extra });

const del = (path, name, use, guard, extra = {}) =>
  req("DELETE", path, { name, use, guard, ...extra });

/** The bearer token every protected call carries. */
const authHeader = [{ key: "Authorization", value: "Bearer {{accessToken}}" }];

// ---------------------------------------------------------------- groups

const health = {
  name: "00 - Health & public config",
  description:
    "Public. No session needed. Use these to confirm the server, its database and its queue are up before starting anything else.",
  item: [
    get("/health/live", "Liveness", "Confirm the process is running and answering.", "None — public."),
    get(
      "/health/ready",
      "Readiness",
      "Confirm the server can actually serve work: database, redis queue and worker are all present. Returns 503 when degraded.",
      "None — public.",
    ),
    get(
      "/health",
      "Health check",
      "Check the database and the redis queue specifically.",
      "None — public.",
    ),
    get(
      "/config",
      "Public config",
      "Read which sign-in methods and which book languages the frontend should offer before a user is signed in.",
      "None — public.",
    ),
  ],
};

const auth = {
  name: "01 - Authentication (Better Auth)",
  description:
    "Sessions are cookie based. `sign-up/email` sends a six digit code; the code is confirmed with `email-otp/verify-email`. Every other endpoint in this collection expects the session cookie that follows. If you drive the API with a bearer token instead, set the `accessToken` variable and add the Authorization header.",
  item: [
    post(
      "/auth/sign-up/email",
      "Sign up",
      "Create an account with an email and a password. A six digit code is emailed; the account stays unverified until it is confirmed.",
      "None — public. Rate limited in production.",
      { name: "Ada Lovelace", email: "ada@example.com", password: "correct-horse-battery" },
    ),
    post(
      "/auth/email-otp/send-verification-otp",
      "Resend the sign-up code",
      "Send the verification code again when the first one expired or never arrived.",
      "None — public. The response stays the same whether or not the account exists.",
      { email: "ada@example.com", type: "sign-up" },
    ),
    post(
      "/auth/email-otp/verify-email",
      "Verify the email",
      "Confirm the six digit code, which marks the account verified and returns the session. A verified session is required by every other endpoint here.",
      "None — public. The code expires after 600 seconds and allows 5 attempts.",
      { email: "ada@example.com", otp: "123456", type: "sign-up" },
    ),
    post(
      "/auth/sign-in/email",
      "Sign in",
      "Sign in with an existing email and password.",
      "None — public.",
      { email: "ada@example.com", password: "correct-horse-battery" },
    ),
    post(
      "/auth/sign-in/email-otp",
      "Sign in with a code",
      "Sign in without a password by receiving a one-time code by email.",
      "None — public.",
      { email: "ada@example.com", otp: "123456" },
    ),
    post(
      "/auth/email-otp/request-password-reset",
      "Request a password reset",
      "Ask for a reset code by email when the password is lost.",
      "None — public.",
      { email: "ada@example.com" },
    ),
    post(
      "/auth/email-otp/reset-password",
      "Reset the password",
      "Set a new password using the code that was emailed.",
      "None — public.",
      { email: "ada@example.com", otp: "123456", password: "a-new-long-password" },
    ),
    get("/auth/get-session", "Read the current session", "Read the signed-in user, so a screen knows whether to show the app or the sign-in form.", "None — public, but returns nothing when there is no session."),
    post("/auth/sign-out", "Sign out", "End the session and clear the cookie.", "None — public."),
  ],
};

const account = {
  name: "02 - Account, credits & projects",
  description:
    "The signed-in author's own account. Every call here is scoped to the session, so one author can never read another's credits or projects.",
  item: [
    get("/users/me", "Read my account", "Read the signed-in user's id, email and name.", "Verified session.", { headers: authHeader }),
    get("/users/me/dashboard", "Dashboard", "Read the counts and recent activity the dashboard shows.", "Verified session.", { headers: authHeader }),
    get("/credits", "Read my credits", "Read the credit balance, the reserved amount and the ledger of recent transactions.", "Verified session.", { headers: authHeader }),
    getQ("/projects", "List projects", "List the projects books are filed under.", "Verified session. Archived projects are hidden unless `archived=all`.", [{ key: "archived", value: "active" }, { key: "search", value: "" }, { key: "limit", value: "24" }], { headers: authHeader }),
    post("/projects", "Create a project", "Group books under a named project so a series can be managed together.", "Verified session.", { name: "Self-help series", description: "Books in the same series." }, { headers: authHeader }),
    patch("/projects/:projectId", "Update a project", "Rename a project, change its description, or archive it.", "Verified session. At least one field is required.", { name: "Self-help series (renamed)", description: "", archived: false }, { headers: authHeader }),
    del("/projects/:projectId", "Delete a project", "Remove a project. The books inside it are kept.", "Verified session.", { headers: authHeader }),
  ],
};

const books = {
  name: "03 - Books & library",
  description:
    "Creating a book, filing it, and finding it again. Creating a book also queues the outline, so the response carries both the book and the outline job.",
  item: [
    post(
      "/books",
      "Create a book",
      "Start a new book from a brief. The outline is generated in the background; the response carries the book and the outline job.",
      "Verified session. Rate limited. Fails with 402 when the credit balance is too low.",
      {
        brief: {
          topic: "How to grow herbs on a small kitchen windowsill",
          bookType: "guide",
          title: "The Windowsill Herb Garden",
          targetAudience: "Beginner cooks with a small kitchen",
          knowledgeLevel: "beginner",
          readerProblem: "They buy herbs and let them die.",
          readerOutcome: "They can grow and use six herbs year round.",
          language: "en",
          tone: "friendly",
          depth: "standard",
          chapterCount: 8,
          wordsPerChapter: 1200,
          authorName: "Ada Lovelace",
          purpose: "Lead magnet for a gardening newsletter",
          readerAge: "25-45",
          writingStyle: "Practical and warm",
          pointOfView: "Second person",
          brandName: "The Small Garden",
          terminology: "Use 'windowsill' rather than 'windowsill garden' consistently.",
          extraInstructions: "",
        },
        projectId: null,
      },
      { headers: authHeader },
    ),
    getQ("/books", "List books", "Find a book in the library. Filter by project, language, type, status, or archived.", "Verified session.", [{ key: "search", value: "" }, { key: "projectId", value: "" }, { key: "language", value: "" }, { key: "bookType", value: "" }, { key: "status", value: "" }, { key: "archived", value: "active" }, { key: "sort", value: "newest" }, { key: "limit", value: "24" }], { headers: authHeader }),
    get("/books/:bookId", "Read a book", "Read one book with its brief, outline status and chapter list.", "Verified session. Own book only.", { headers: authHeader }),
    patch("/books/:bookId", "File a book", "Move a book into a project, or archive it.", "Verified session. At least one field is required.", { projectId: "", archived: false }, { headers: authHeader }),
    post("/books/:bookId/duplicate", "Duplicate a book", "Copy a book so the author can work on a variant without losing the original.", "Verified session. The copy carries no jobs, exports, history or credit spend.", { includeManuscript: false }, { headers: authHeader }),
    del("/books/:bookId", "Delete a book", "Remove a book and its manuscript.", "Verified session. Own book only. The delete is soft, so a restore can still find it.", { headers: authHeader }),
    put("/books/:bookId/brief", "Change the brief", "Change what the book is about, before any chapter is written.", "Verified session. Refused once a chapter is written, and refused while a job is running.", { topic: "How to grow herbs on a small kitchen windowsill", bookType: "guide", title: "The Windowsill Herb Garden", targetAudience: "Beginner cooks", knowledgeLevel: "beginner", language: "en", tone: "friendly", depth: "standard", chapterCount: 8, wordsPerChapter: 1200 }, { headers: authHeader }),
  ],
};

const outline = {
  name: "04 - Outline",
  description:
    "The outline is the plan of the book. It is generated, edited by the author, and approved before any chapter is written. Every edit creates a version, so an earlier plan can be restored.",
  item: [
    post("/books/:bookId/outline/generate", "Generate the outline", "Draft the chapter plan from the brief.", "Verified session. Rate limited. Charged against the credit balance.", undefined, { headers: authHeader }),
    getQ("/books/:bookId/outlines", "Outline history", "Read the saved versions of the outline, newest first.", "Verified session.", [{ key: "before", value: "" }], { headers: authHeader }),
    get("/books/:bookId/outlines/:version", "Read one outline version", "Read the chapter plan as it was at that version.", "Verified session.", { headers: authHeader }),
    post("/books/:bookId/outlines/:version/restore", "Restore an outline version", "Go back to an earlier plan and make it the current one, as a new version.", "Verified session. The version it was based on is checked, so a lost edit is refused. `baseVersion` is the current outline version.", { baseVersion: 1 }, { headers: authHeader }),
    put("/books/:bookId/outline", "Save an edited outline", "Change the chapter titles, goals, key points or word targets.", "Verified session. `baseVersion` refuses a lost edit rather than overwriting a newer save. A book with no outline yet starts at version 0.", { title: "The Windowsill Herb Garden", subtitle: "Six herbs, one windowsill, all year", baseVersion: 0, chapters: [{ id: "", title: "Before you buy a single pot", goal: "Set up the space", keyPoints: ["Choosing a windowsill", "Light and heat", "What to clear away"], targetWords: 1200 }] }, { headers: authHeader }),
    post("/books/:bookId/outline/approve", "Approve the outline", "Accept the plan. Chapters can only be written once the outline is approved.", "Verified session. Approving twice is harmless. Refused while a job is running.", { version: 1 }, { headers: authHeader }),
  ],
};

const generation = {
  name: "05 - Generation (chapters)",
  description:
    "Writing the chapters. A run reserves credits, writes each chapter section by section, and settles what it actually used. A retry reuses the sections an earlier failed run already wrote, and charges only for the prose it still has to write.",
  item: [
    post("/books/:bookId/generate", "Start writing", "Queue the chapters of an approved outline for writing.", "Verified session. Rate limited. The outline must be approved and no other run may be active. Returns 402 when the balance is too low.", undefined, { headers: authHeader }),
    post("/books/:bookId/generate/retry", "Retry writing", "Start again after a failure. The sections the failed run already wrote are reused, and only the remaining prose is charged for.", "Verified session. Rate limited. Same requirements as starting a run.", undefined, { headers: authHeader }),
    post("/books/:bookId/generate/cancel", "Cancel writing", "Stop a run that is queued or in progress, and release the credits it had reserved.", "Verified session. A run that has already finished cannot be cancelled.", undefined, { headers: authHeader }),
    get("/generation-jobs/:jobId", "Read a generation job", "Read how far a run has got, what it was charged, and why it failed.", "Verified session. Own job only.", { headers: authHeader }),
  ],
};

const chapters = {
  name: "06 - Chapters & editor",
  description:
    "Reading and editing the manuscript. Every save carries the version it was based on, so two tabs editing the same chapter cannot silently overwrite each other.",
  item: [
    get("/books/:bookId/chapters", "List chapters", "Read the chapters of a book, in order.", "Verified session.", { headers: authHeader }),
    get("/chapters/:chapterId", "Read a chapter", "Read one chapter with its content, summary and word count.", "Verified session. Own chapter only.", { headers: authHeader }),
    patch("/chapters/:chapterId", "Save a chapter", "Save an edit to a chapter.", "Verified session. `version` refuses a lost edit with 409 rather than overwriting a newer save.", { title: "Before you buy a single pot", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A windowsill is enough." }] }] }, version: 0 }, { headers: authHeader }),
    getQ("/chapters/:chapterId/versions", "Chapter version history", "Read the saved versions of a chapter.", "Verified session.", [{ key: "before", value: "" }], { headers: authHeader }),
    get("/chapters/:chapterId/versions/:versionId", "Read one chapter version", "Read a chapter as it was at that version.", "Verified session.", { headers: authHeader }),
    post("/chapters/:chapterId/versions/:versionId/restore", "Restore a chapter version", "Go back to an earlier version of a chapter and make it the current one.", "Verified session. `version` refuses a lost edit.", { version: 0 }, { headers: authHeader }),
    post("/ai/assist", "Ask the assistant", "Rewrite, expand, shorten, proofread or otherwise change the selected text.", "Verified session. Rate limited. One credit per request. `Idempotency-Key` makes a repeated request free.", { bookId: "{{bookId}}", action: "rewrite", text: "A windowsill is enough.", instruction: "Make it warmer" }, { headers: [...authHeader, { key: "Idempotency-Key", value: "assist-{{$timestamp}}" }] }),
  ],
};

const quality = {
  name: "07 - Quality review",
  description:
    "Free deterministic checks on the manuscript, plus a costed AI review. A report is anchored to the exact text it found, so it survives later edits.",
  item: [
    get("/quality/config", "Quality configuration", "Read which checks are available and what they cost.", "Verified session.", { headers: authHeader }),
    get("/books/:bookId/quality/context", "Read the book context", "Read the voice, terminology, definitions and chapter summaries the checks run against.", "Verified session.", { headers: authHeader }),
    put("/books/:bookId/quality/context", "Save the book context", "Save the voice, the preferred terms, the definitions and the chapter summaries.", "Verified session. `baseVersion` refuses a lost edit. A book with no saved context starts at version 0.", { baseVersion: 0, data: { voice: "Practical and warm", terms: [{ preferred: "windowsill", avoid: ["windowsill garden"], note: "" }], definitions: [{ term: "windowsill", definition: "A horizontal ledge outside a window.", note: "" }], chapterSummaries: [] } }, { headers: authHeader }),
    get("/books/:bookId/quality/reports", "List quality reports", "List the reports produced for a book.", "Verified session.", { headers: authHeader }),
    post("/books/:bookId/quality/reports", "Run the free checks", "Run the deterministic checks. The report is reused when nothing has changed since the last one.", "Verified session. Free. Returns 201 for a new report and 200 when an unchanged report is reused.", {}, { headers: authHeader }),
    get("/books/:bookId/quality/reports/:reportId", "Read a quality report", "Read one report with its findings.", "Verified session.", { headers: authHeader }),
    post("/books/:bookId/quality/ai-reviews", "Start an AI review", "Ask a model to review the chapters and report what it found, with the quoted text it found it in.", "Verified session. Rate limited. Charged per chapter. The request is idempotent.", { chapterIds: ["{{chapterId}}"], expectedCredits: 1 }, { headers: authHeader }),
    post("/books/:bookId/quality/ai-reviews/:jobId/cancel", "Cancel an AI review", "Stop a queued AI review and release the credits it reserved.", "Verified session.", { headers: authHeader }),
    get("/quality/findings/:findingId", "Read one finding", "Read a single finding and the text it points at.", "Verified session.", { headers: authHeader }),
    patch("/quality/findings/:findingId", "Decide on a finding", "Mark a finding resolved or dismissed, and record why.", "Verified session. A dismissal needs a note of at least 3 characters.", { status: "resolved", note: "" }, { headers: authHeader }),
  ],
};

const design = {
  name: "08 - Interior design",
  description:
    "The book's interior: typography, page setup, front and back matter. Every save is a version, so a design can be rolled back.",
  item: [
    get("/design/templates", "List design templates", "Read the templates that can be applied to a book.", "Verified session.", { headers: authHeader }),
    get("/design/capabilities", "Design capabilities", "Read which fonts this server can actually render, per language.", "Verified session.", { headers: authHeader }),
    get("/design-fonts/:font", "Download a font face", "Fetch the pinned, hash-verified bytes of one font face, so the preview renders exactly as the export will.", "Verified session. Only the bundled faces are served.", { headers: authHeader }),
    get("/books/:bookId/design", "Read the design", "Read the book's saved design at the current version, or at a named one.", "Verified session.", { headers: authHeader }),
    get("/books/:bookId/design/versions", "Design history", "List the saved versions of the design.", "Verified session.", { headers: authHeader }),
    put("/books/:bookId/design", "Save the design", "Save the typography, page setup and matter.", "Verified session. `baseVersion` refuses a lost edit. A book that has never been designed starts at version 0.", {
      baseVersion: 0,
      data: {
        schema: 1,
        template: null,
        typography: { body: "serif", headings: "serif", lineHeight: 1.6, paragraph: "spaced", align: "start", headingScale: "standard", hyphenate: true },
        elements: { accent: "#e8603c", chapterLabel: "number", chapterOrnament: "none", tableStyle: "grid", imageWidth: "full", captionAlign: "center" },
        digital: { fontScale: 1, lineWidth: "standard" },
        print: { trim: "6x9", fontSizePt: 11, margins: { top: 0.8, bottom: 0.85, inside: 0.7, outside: 0.7 }, mirrored: false, header: "none", pageNumbers: "bottom-center" },
        matter: {
          titlePage: true,
          copyright: { enabled: true, text: "© 2026 Ada Lovelace. All rights reserved." },
          dedication: { enabled: false, text: "" },
          contents: { enabled: true, title: "Contents" },
          aboutAuthor: { enabled: false, title: "About the author", text: "" },
          references: { enabled: false, title: "References", text: "" },
        },
      },
    }, { headers: authHeader }),
    post("/books/:bookId/design/apply-template", "Apply a template", "Apply one of the built-in templates as a reversible snapshot. The front and back matter is never touched.", "Verified session. `baseVersion` refuses a lost edit. A book that has never been designed starts at version 0.", { baseVersion: 0, templateId: "classic", templateVersion: 1 }, { headers: authHeader }),
    post("/books/:bookId/design/restore", "Restore a design version", "Go back to an earlier design and make it the current one.", "Verified session. `baseVersion` refuses a lost edit.", { baseVersion: 1, version: 1 }, { headers: authHeader }),
    post("/books/:bookId/design/preview", "Preview the design", "Render the design as a reader would see it, or as a print sample, without saving anything.", "Verified session. Preview either a saved version or a draft, never both. The print mode returns a PDF with the layout warnings in its headers.", { mode: "print", version: 1 }, { headers: authHeader }),
  ],
};

const covers = {
  name: "09 - Cover studio & image generation",
  description:
    "The cover is a saved design plus optional generated artwork. Generation is queued and charged; the saved cover is versioned so an earlier one can be returned to.",
  item: [
    get("/image-config", "Image generation configuration", "Read what image generation costs and whether it is enabled on this server.", "Verified session.", { headers: authHeader }),
    get("/cover-fonts/:font", "Download a cover font", "Fetch the pinned bytes of a cover font face.", "Verified session.", { headers: authHeader }),
    get("/books/:bookId/cover", "Read the cover", "Read the book's saved cover design at the current version, or at a named one.", "Verified session.", { headers: authHeader }),
    put("/books/:bookId/cover", "Save the cover", "Save the cover: artwork, background, shading and the position of the title, subtitle and author.", "Verified session. `baseVersion` refuses a lost edit. A book with no saved cover starts at version 0.", {
      baseVersion: 0,
      data: {
        artworkId: null,
        background: "#172033",
        shade: 0.35,
        visual: { style: "editorial", palette: "", characters: "", direction: "" },
        title: { text: "The Windowsill Herb Garden", font: "notosans", color: "#ffffff", x: 0.08, y: 0.08, width: 0.84, height: 0.3, size: 0.06, weight: "700", align: "center", direction: "ltr" },
        subtitle: { text: "Six herbs, one windowsill, all year", font: "notosans", color: "#ffffff", x: 0.08, y: 0.4, width: 0.84, height: 0.2, size: 0.03, weight: "400", align: "center", direction: "ltr" },
        author: { text: "Ada Lovelace", font: "notosans", color: "#ffffff", x: 0.08, y: 0.85, width: 0.84, height: 0.1, size: 0.035, weight: "700", align: "center", direction: "ltr" },
      },
    }, { headers: authHeader }),
    getQ("/books/:bookId/cover/render", "Download the cover", "Render the saved cover to a JPEG the author can use.", "Verified session. The version must be saved and selected first. Text that would overflow is refused rather than silently clipped.", [{ key: "version", value: "{{coverVersion}}" }], { headers: authHeader }),
    post("/books/:bookId/images", "Generate an image", "Queue generated artwork for the cover or an illustration.", "Verified session. Rate limited. `expectedCredits` is checked against the price before anything is queued, and the credits are reserved. Cover artwork must be portrait.", { purpose: "cover", prompt: "A sunlit kitchen windowsill with six potted herbs", aspect: "portrait", expectedCredits: 4 }, { headers: authHeader }),
    getQ("/books/:bookId/images", "Image history", "Read the image generation jobs for a book.", "Verified session.", [{ key: "cursor", value: "" }], { headers: authHeader }),
    post("/books/:bookId/images/:jobId/cancel", "Cancel an image job", "Cancel a queued image job and release the credits it reserved.", "Verified session.", { headers: authHeader }),
  ],
};

const assets = {
  name: "10 - Image library (assets)",
  description:
    "Private images the author uploaded. They are decoded, stripped of metadata and re-encoded on the way in, and served only to their owner.",
  item: [
    getQ("/assets", "List images", "List the images in the library.", "Verified session.", [{ key: "cursor", value: "" }], { headers: authHeader }),
    req("POST", "/assets", {
      name: "Upload an image",
      use: "Add an image to the library so it can be used in the manuscript or on a cover.",
      guard: "Verified session. Accepts image/png, image/jpeg and image/webp only, up to the shared size limit. The bytes are re-encoded, so metadata is stripped and a spoofed content type is refused.",
      body: "",
      headers: [...authHeader, { key: "Content-Type", value: "image/png" }],
      bodyLanguage: "text",
    }),
    get("/assets/:id/content", "Read an image", "Read the stored bytes of an image, as webp.", "Verified session. Own asset only.", { headers: authHeader }),
    patch("/assets/:id", "Edit an image", "Change an image's alt text or caption, so the manuscript stays accessible.", "Verified session. Both fields are required.", { alt: "Six herb pots on a sunlit windowsill", caption: "The windowsill in early summer." }, { headers: authHeader }),
    del("/assets/:id", "Delete an image", "Remove an image from the library.", "Verified session. References already saved in the manuscript are pinned, so deleting does not break the book.", { headers: authHeader }),
  ],
};

const sources = {
  name: "11 - Sources, research & citations",
  description:
    "Private documents the author imported. Extraction is separate and reviewable: the text becomes proposed chapters that the author confirms before anything is written into the manuscript. Answers are grounded in the passages that support them, or the API says it cannot answer.",
  item: [
    get("/sources/formats", "Source formats", "Read the formats this server can extract and the size each accepts.", "Verified session.", { headers: authHeader }),
    get("/books/:bookId/sources", "List sources", "List the sources attached to a book.", "Verified session.", { headers: authHeader }),
    req("POST", "/books/:bookId/sources", {
      name: "Upload a source",
      use: "Import a document the book is written from, so passages can be cited and used as chapters.",
      guard: "Verified session. The body is the file itself; the metadata travels in the query string. Up to 5 MiB. A document with no text layer is reported as scanned rather than imported as empty.",
      body: "",
      headers: [...authHeader, { key: "Content-Type", value: "text/plain" }],
      bodyLanguage: "text",
    }),
    get("/sources/:sourceId", "Read a source", "Read one source with its extraction status and counts.", "Verified session.", { headers: authHeader }),
    get("/sources/:sourceId/versions", "Source versions", "List the extracted versions of a source. Each version is immutable, so a citation points at exact text.", "Verified session.", { headers: authHeader }),
    getQ("/sources/:sourceId/passages", "Read the passages", "Read the passages extracted from a source version.", "Verified session.", [{ key: "version", value: "{{sourceVersion}}" }], { headers: authHeader }),
    getQ("/sources/:sourceId/preview", "Preview an import", "Read the chapter mapping the import would make, before anything is written.", "Verified session.", [{ key: "version", value: "{{sourceVersion}}" }], { headers: authHeader }),
    post("/sources/:sourceId/apply", "Confirm the import", "Write the confirmed passages into the manuscript as chapters.", "Verified session. A passage the version does not have is refused. Confirming the same version twice does not create duplicate chapters.", { version: 1, chapters: [{ title: "Before you buy a single pot", locators: ["p1", "p2"] }], appendToChapterIds: [] }, { headers: authHeader }),
    post("/sources/:sourceId/links", "Link a source to a chapter", "Record that particular passages support a particular chapter.", "Verified session.", { chapterId: "{{chapterId}}", locators: ["p1"], note: "The light requirements come from here." }, { headers: authHeader }),
    get("/sources/:sourceId/links", "Read the links", "Read which chapters this source supports, and with which passages.", "Verified session.", { headers: authHeader }),
    del("/sources/:sourceId", "Delete a source", "Remove a source and its citations.", "Verified session. The citations stay visible in the quality report as a lost source, rather than disappearing.", { headers: authHeader }),
    get("/chapters/:chapterId/sources", "Read a chapter's citations", "Read the citations of one chapter, and whether each source still supports it.", "Verified session.", { headers: authHeader }),
    get("/sources/:sourceId/passages/:locator", "Read one cited passage", "Read the exact text behind a citation, so a reader can check it.", "Verified session.", { headers: authHeader }),
    post("/books/:bookId/research/ask", "Ask a question of the sources", "Ask a question the book is able to answer from its sources.", "Verified session. Rate limited. When the sources do not support an answer, the response says so and carries no passages rather than inventing one.", { question: "How much light does basil need?", sourceIds: [] }, { headers: authHeader }),
    post("/books/:bookId/research/summary", "Summarize the sources", "Summarize what the book's sources say, with the passages the summary rests on.", "Verified session. Rate limited.", { sourceIds: [] }, { headers: authHeader }),
  ],
};

const exports = {
  name: "12 - Exports",
  description:
    "An export is an immutable snapshot: the design, the chapters and the pinned image bytes are captured when it is requested, so a later edit cannot change what a queued export renders. Every export is validated before it is offered for download.",
  item: [
    get("/exports/formats", "List export formats", "Read the formats this server can produce and the options each accepts.", "Verified session.", { headers: authHeader }),
    get("/books/:bookId/exports", "List exports", "List the exports made for a book.", "Verified session.", { headers: authHeader }),
    post("/books/:bookId/exports", "Request an export", "Queue an export. The file is rendered in the background.", "Verified session. The options are validated against the format, so an EPUB option cannot be sent for a PDF. Only one export per book may be in progress.", { format: "pdf", options: { layout: "print", includeMatter: true, includeToc: true } }, { headers: authHeader }),
    get("/exports/:exportId", "Read an export", "Read one export with its snapshot and its validation summary.", "Verified session.", { headers: authHeader }),
    get("/exports/:exportId/download", "Download an export", "Download the finished file.", "Verified session. The download is refused when the file did not validate.", { headers: authHeader }),
  ],
};

const distribution = {
  name: "13 - Distribution packages",
  description:
    "A package is a ZIP the author downloads and uploads to a store themselves. The product assembles and checks it. It never publishes to a store and never claims a store accepted the book.",
  item: [
    get("/distribution/destinations", "List destinations", "Read the destinations a package can be prepared for, and the rules each one applies.", "Verified session.", { headers: authHeader }),
    get("/distribution/books/:bookId/packages", "List packages", "List the packages prepared for a book.", "Verified session.", { headers: authHeader }),
    post("/distribution/books/:bookId/packages", "Prepare a package", "Assemble the ZIP for a destination from the book's ready exports.", "Verified session. A package that cannot satisfy the destination's rules is recorded as blocked and refused with 422 rather than assembled.", {
      destination: "kdp_ebook",
      exportIds: ["{{exportId}}"],
      metadata: {
        title: "The Windowsill Herb Garden",
        subtitle: "Six herbs, one windowsill, all year",
        author: "Ada Lovelace",
        language: "en",
        description: "A practical guide to growing six herbs on one kitchen windowsill.",
        asin: "",
        isbn: "",
        keywords: ["herbs", "windowsill", "cooking"],
        categories: ["Gardening", "Cooking"],
        publisher: "The Small Garden",
        publicationDate: "2026-03-01",
      },
      includeCover: true,
      notes: "Upload the EPUB through KDP's own page.",
    }, { headers: authHeader }),
    get("/distribution/packages/:packageId", "Read a package", "Read one package with its files and the checks that were run on it.", "Verified session.", { headers: authHeader }),
    get("/distribution/packages/:packageId/download", "Download a package", "Download the ZIP the author uploads to the store themselves.", "Verified session. Own package only.", { headers: authHeader }),
    get("/distribution/books/:bookId/publishing-status", "Read publishing status", "Read the author's own record of what they have done with each store.", "Verified session. Only the author knows whether a store accepted the book.", { headers: authHeader }),
    post("/distribution/books/:bookId/publishing-status", "Record publishing status", "Record what the author has done: not prepared, in progress, submitted or published.", "Verified session.", { destination: "kdp_ebook", state: "submitted", externalReference: "B0ABCDEF1", note: "Submitted through KDP." }, { headers: authHeader }),
  ],
};

const listing = {
  name: "14 - Store listing copy",
  description:
    "The product drafts the text a store's own form asks for, and calculates what the author would keep at the price they chose. No store API is called from anywhere here: the author submits the listing themselves.",
  item: [
    get("/listings/destinations", "List listing destinations", "Read the fields each destination's form asks for, and the rate it publishes.", "Verified session.", { headers: authHeader }),
    post("/listings/royalty-quote", "Quote the royalty", "Calculate what the author would keep at a price, without spending any credits.", "Verified session. A pure calculation — safe to call as often as the price moves.", { destination: "kdp_ebook", priceInMinorUnits: 999 }, { headers: authHeader }),
    get("/listings/books/:bookId", "List listings", "List the listings prepared for a book.", "Verified session.", { headers: authHeader }),
    post("/listings/books/:bookId", "Prepare a listing", "Draft the listing copy for a destination from the author's own manuscript.", "Verified session. Charged against the credit balance. Refused when the book has no manuscript.", { destination: "kdp_ebook", priceInMinorUnits: 999 }, { headers: authHeader }),
    get("/listings/:listingId", "Read a listing", "Read one listing with its fields, their limits and the royalty estimate.", "Verified session.", { headers: authHeader }),
    get("/listings/:listingId/gaps", "Read the gaps in a listing", "Read which fields the listing is still missing, and whether it has gone stale because the manuscript moved on.", "Verified session.", { headers: authHeader }),
    patch("/listings/:listingId", "Save an edited listing", "Change the price or the text of a listing field, and confirm the fields the author has checked.", "Verified session. `baseVersion` refuses a lost edit rather than overwriting a newer save.", { baseVersion: 1, priceInMinorUnits: 999, fields: { description: "A practical guide to growing six herbs on one kitchen windowsill." }, confirmed: { description: true } }, { headers: authHeader }),
  ],
};

const marketing = {
  name: "15 - Marketing studio",
  description:
    "Everything here produces material the author downloads and uses themselves. No route sends an email, posts to a social network or publishes anything. Every output stays editable, and claims that would need proof are flagged rather than removed.",
  item: [
    get("/marketing/outputs", "List output types", "Read the kinds of material the studio can draft, and what each one costs.", "Verified session.", { headers: authHeader }),
    get("/marketing/books/:bookId/drafts", "List drafts", "List the marketing drafts for a book.", "Verified session.", { headers: authHeader }),
    post("/marketing/books/:bookId/drafts", "Draft marketing copy", "Draft a piece of launch material from the book's own manuscript.", "Verified session. Charged against the credit balance. The cost is shown in the output types before the request is made. Refused when the book has no manuscript.", { outputType: "description", tone: "clear", audience: "Beginner cooks", instruction: "", authorName: "" }, { headers: authHeader }),
    get("/marketing/drafts/:draftId", "Read a draft", "Read one draft with its flags, and whether the manuscript has moved on since it was written.", "Verified session.", { headers: authHeader }),
    patch("/marketing/drafts/:draftId", "Save an edited draft", "Save the author's own edit, or approve the draft.", "Verified session. `baseVersion` refuses a lost edit.", { content: "Six herbs, one windowsill, all year.", baseVersion: 1, approve: false }, { headers: authHeader }),
    post("/marketing/drafts/:draftId/regenerate", "Regenerate a draft", "Draft a fresh version without losing the edited one.", "Verified session. The existing draft is kept, so a manual edit is never overwritten.", undefined, { headers: authHeader }),
    get("/marketing/books/:bookId/graphics", "List graphics", "List the promotional graphics composed for a book.", "Verified session.", { headers: authHeader }),
    post("/marketing/books/:bookId/graphics", "Compose a graphic", "Compose a promotional graphic and render it to an image the author can download.", "Verified session. The image is rendered locally and stored privately. A colour that is not a hex value is refused.", { template: "square_cover", headline: "Six herbs, one windowsill", subhead: "All year round", callToAction: "Start growing", textColor: "#1b1b1f", backgroundColor: "#f5f1e8", useCover: true }, { headers: authHeader }),
    get("/marketing/graphics/:graphicId", "Read a graphic", "Read one graphic with its copy and its metadata.", "Verified session.", { headers: authHeader }),
    get("/marketing/graphics/:graphicId/download", "Download a graphic", "Download the rendered graphic as a PNG the author can use.", "Verified session. Own graphic only. The lookup is scoped to the owner, so one author cannot download another's graphic.", { headers: authHeader }),
    get("/marketing/books/:bookId/samples", "List samples", "List the sample packs assembled for a book.", "Verified session.", { headers: authHeader }),
    post("/marketing/books/:bookId/samples", "Assemble a sample", "Assemble a sample pack from the chapters the author chose.", "Verified session. The chapters must belong to the book and must be written. A chapter of another book is refused, and so is a pack larger than a sample may hold. The file is validated before it is offered.", { chapterIds: ["{{chapterId}}"], format: "pdf" }, { headers: authHeader }),
    get("/marketing/samples/:sampleId/download", "Download a sample", "Download the sample pack the author hands out themselves.", "Verified session. Own sample only.", { headers: authHeader }),
  ],
};

const publishingChecks = {
  name: "16 - Publishing checks",
  description:
    "A readiness report for one marketplace. It checks the book against that marketplace's rules and states the source of every rule. It never declares that the store will accept the book.",
  item: [
    getQ("/books/:bookId/publishing-checks", "Run the publishing checks", "Read the readiness report for a destination: which checks pass, which block, and which need the author's own eyes.", "Verified session. The destination must be one of kdp_ebook, etsy, gumroad or direct.", [{ key: "destination", value: "kdp_ebook" }], { headers: authHeader }),
  ],
};

const support = {
  name: "17 - Support center (customer)",
  description:
    "The customer's own side of support. A customer submits a request and gets back a correlation id, so they can quote it when they follow up and support can find the matching logs.",
  item: [
    post("/support/requests", "Submit a support request", "Ask for help and receive a correlation id to quote later.", "Verified session. The request is recorded whether or not it can be answered immediately.", { category: "question", subject: "My export is missing its cover", message: "The PDF I downloaded has no cover page. I expected one.", context: "Exported a PDF from the export screen", email: "ada@example.com", correlationId: "" }, { headers: authHeader }),
    get("/support/requests", "List my support requests", "Read the requests this customer submitted, and the answer an agent wrote.", "Verified session. A customer sees only their own requests, and never an agent's internal notes.", { headers: authHeader }),
  ],
};

const operations = {
  name: "18 - Operations (author-visible)",
  description:
    "How a long-running request is doing. Every queued action returns an operation the author can poll, so a screen can show real progress rather than a spinner.",
  item: [
    get("/operations/:operationId", "Read an operation", "Read the state of one queued action.", "Verified session. Own operation only.", { headers: authHeader }),
    getQ("/books/:bookId/operations", "List a book's operations", "Read every queued action for a book.", "Verified session.", [{ key: "limit", value: "24" }, { key: "cursor", value: "" }], { headers: authHeader }),
  ],
};

const admin = {
  name: "19 - Administration",
  description:
    "The operator's API. Every route checks a permission on the server, so an operator who navigates straight to a route they have no permission for is refused with a 403 that names the missing permission. The roles are `support` (ops.read, users.manage, deliveries.read, support.reply), `finance` (ops.read, billing.read, billing.refund, credits.adjust, audit.read) and `administrator` (everything).",
  item: [
    get("/admin/me", "Read my operator authority", "Read which roles the signed-in operator holds and what they permit.", "Verified session. Returns the roles and permissions; it does not grant anything.", { headers: authHeader }),
    get("/admin/dashboard", "Operations dashboard", "Read the operational overview: users, books, jobs, payments and queue health.", "Verified session. Requires `ops.read`.", { headers: authHeader }),
    getQ("/admin/users", "List users", "Find a user by email or id.", "Verified session. Requires `ops.read`.", [{ key: "search", value: "" }, { key: "limit", value: "100" }], { headers: authHeader }),
    getQ("/admin/books", "List books", "Read every book across all authors, with its owner.", "Verified session. Requires `ops.read`.", [{ key: "limit", value: "100" }], { headers: authHeader }),
    getQ("/admin/jobs", "List generation jobs", "Read the generation jobs across all books.", "Verified session. Requires `ops.read`.", [{ key: "status", value: "" }, { key: "limit", value: "100" }], { headers: authHeader }),
    getQ("/admin/payments", "List payments", "Read the payments across all customers.", "Verified session. Requires `billing.read`.", [{ key: "status", value: "" }, { key: "limit", value: "100" }], { headers: authHeader }),
    get("/admin/incidents", "List open incidents", "Read the operational incidents that are still open.", "Verified session. Requires `ops.read`.", { headers: authHeader }),
    post("/admin/incidents/:incidentId/resolve", "Resolve an incident", "Close an incident and record how it was resolved.", "Verified session. Requires `ops.read`.", { resolution: "The provider was restored and the queue drained." }, { headers: authHeader }),
    get("/admin/alerts", "Alert history", "Read the alerts that were raised and whether they were delivered.", "Verified session. Requires `ops.read`.", { headers: authHeader }),
    post("/admin/alerts", "Raise an alert", "Raise an operational alert and report whether it was delivered.", "Verified session. Requires `ops.read`. A destination must be configured, otherwise the request is refused.", { kind: "provider_error", summary: "The writing provider is returning errors.", severity: "warning" }, { headers: authHeader }),
    post("/admin/credits/adjust", "Adjust a customer's credits", "Add or take away credits from a customer's balance.", "Verified session. Requires `credits.adjust`. The adjustment goes through the credit ledger so the balance still reconciles, and the reason is required because an operator reads it later.", { userId: "{{userId}}", credits: 25, reason: "Goodwill credit for the failed export on 12 March." }, { headers: authHeader }),
    post("/admin/payments/refund", "Refund a payment", "Refund a payment, taking the credits back and withdrawing the capabilities it granted.", "Verified session. Requires `billing.refund`. Refusing a second refund of the same payment is refused.", { paymentId: "{{paymentId}}", reason: "The customer was charged twice for the same plan." }, { headers: authHeader }),
    post("/admin/jobs/intervene", "Retry or cancel a job", "Release a stuck job back to the queue, or cancel it.", "Verified session. Requires `jobs.intervene`. The intervention goes through the service that owns the job, so the credits settle correctly. A job that has already finished is refused.", { jobId: "{{jobId}}", action: "retry", reason: "The worker died while the job was queued." }, { headers: authHeader }),
    get("/admin/roles", "List roles and holders", "Read the operator roles and who holds them.", "Verified session. Requires `roles.manage`.", { headers: authHeader }),
    post("/admin/roles/grant", "Grant a role", "Give an operator a role.", "Verified session. Requires `roles.manage`. The reason is required.", { userId: "{{userId}}", role: "support", reason: "Joined the support team this month." }, { headers: authHeader }),
    post("/admin/roles/revoke", "Revoke a role", "Take a role away from an operator.", "Verified session. Requires `roles.manage`. The reason is required.", { userId: "{{userId}}", role: "support", reason: "Left the support team." }, { headers: authHeader }),
    getQ("/admin/audit", "Read the audit trail", "Read who did what, and why.", "Verified session. Requires `audit.read`.", [{ key: "limit", value: "100" }, { key: "action", value: "" }, { key: "targetType", value: "" }, { key: "targetId", value: "" }, { key: "actorId", value: "" }], { headers: authHeader }),
    getQ("/admin/backups", "List backups", "Read the backups that have been taken, with their checksums and counts.", "Verified session. Requires `backup.manage`.", [{ key: "limit", value: "50" }], { headers: authHeader }),
    get("/admin/backups/:name", "Read one backup", "Read the manifest of one backup.", "Verified session. Requires `backup.manage`.", { headers: authHeader }),
    post("/admin/backups", "Take a backup", "Take a backup of the database and record its checksums and counts.", "Verified session. Requires `backup.manage`.", { name: "", reason: "Before the schema change." }, { headers: authHeader }),
    post("/admin/backups/:name/restore", "Rehearse a restore", "Load a backup into a separate database and check the counts against its manifest.", "Verified session. Requires `backup.manage`. The live database is never touched by a rehearsal.", { keepDatabase: false, reason: "Monthly rehearsal." }, { headers: authHeader }),
    del("/admin/backups/:name", "Delete a backup", "Remove a backup.", "Verified session. Requires `backup.manage`.", { headers: authHeader }),
    getQ("/admin/support", "List support requests", "Read the support requests from every customer, so an agent can pick one up.", "Verified session. Requires `support.reply`.", [{ key: "status", value: "" }, { key: "limit", value: "100" }], { headers: authHeader }),
    post("/admin/support/:requestId/reply", "Reply to a support request", "Answer a customer's support request. The answer is then visible to that customer.", "Verified session. Requires `support.reply`.", { response: "The cover is included when the design has artwork selected. Here is how to attach it." }, { headers: authHeader }),
  ],
};

const billing = {
  name: "20 - Billing",
  description:
    "Plans, checkout and payments. Credits and entitlements are granted only by a verified payment event, never by a browser callback.",
  item: [
    get("/billing/plans", "List plans", "Read the plans on offer, with their prices, credits and capabilities.", "None — public. The catalogue is not private information."),
    get("/billing", "Read my billing state", "Read the author's subscription, entitlements, plans and payment history.", "Verified session.", { headers: authHeader }),
    post("/billing/checkout", "Start a checkout", "Ask for a checkout session for a plan.", "Verified session. Grants nothing until a verified payment arrives.", { planId: "{{planId}}" }, { headers: authHeader }),
    post("/billing/cancel", "Cancel my subscription", "Cancel the subscription. It runs to the end of the period already paid for.", "Verified session.", undefined, { headers: authHeader }),
    get("/billing/payments", "List my payments", "Read the author's own payment history.", "Verified session. Scoped to the author, so one customer cannot read another's payments.", { headers: authHeader }),
    req("POST", "/billing/webhook", {
      name: "Payment webhook",
      use: "The payment processor tells the merchant that a customer paid. This is what actually grants the credits.",
      guard: "No session. The signature over the raw body is the authentication, and the timestamp stops a captured body being replayed. Only `payment.succeeded` grants credits; every other event changes state but grants nothing.",
      body: "{\n  \"type\": \"payment.succeeded\",\n  \"providerEventId\": \"evt_123\",\n  \"providerPaymentId\": \"pay_123\",\n  \"occurredAt\": \"2026-03-01T00:00:00.000Z\",\n  \"customerReference\": \"cus_123\",\n  \"planId\": \"pro\",\n  \"amountMinor\": 2900,\n  \"currency\": \"USD\",\n  \"credits\": 500\n}",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "x-ebookstudio-signature", value: "v1=<hmac>" },
        { key: "x-ebookstudio-timestamp", value: "1772323200" },
      ],
    }),
  ],
};

const localProvider = {
  name: "21 - Local payment provider (test only)",
  description:
    "Stands in for a payment processor so the merchant side can be exercised end to end. It is only mounted when the build talks to the local provider, which cannot take real money. The customer cannot name an amount: both the amount and the customer come from the checkout the merchant created.",
  item: [
    get("/local-provider/pay/:session", "Read the checkout page", "Read what the customer is about to pay for.", "None. Not reachable in a build with a live provider.", undefined, { headers: authHeader }),
    post("/local-provider/pay/:session", "Pay the checkout", "The customer pays. The processor signs a `payment.succeeded` event and delivers it to the merchant's webhook, which is what grants the credits.", "None. Not reachable in a build with a live provider.", undefined, { headers: authHeader }),
  ],
};

const collection = {
  info: {
    name: "eBookStudio API",
    description:
      "Every endpoint of the eBookStudio backend, with the use case it serves and the guard that enforces it.\n\n" +
      "**How to use it.**\n" +
      "1. Set `baseUrl` to your API host (default `http://localhost:4000`).\n" +
      "2. Sign up, then verify the email with the six digit code. The session cookie is set on the response.\n" +
      "3. Create a book, approve its outline, then start writing. The `{{bookId}}`, `{{chapterId}}` and `{{jobId}}` variables are filled in from the responses as you go.\n\n" +
      "**Authentication.** The API is session based: send the session cookie. The `Authorization: Bearer {{accessToken}}` header is included on the protected requests so a token based setup also works.\n\n" +
      "**The boundary the product keeps.** Nothing in this API publishes, emails or posts on an author's behalf. The distribution and marketing routes produce files the author downloads and uses themselves, and the publishing status is the author's own record of what they did with a store.\n\n" +
      "**Errors.** Every error carries `{ \"error\": { \"code\", \"message\", \"details\" } }` and an `x-request-id` header that matches the server log line.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: {
    type: "bearer",
    bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
  },
  variable: variables,
  item: [
    health,
    auth,
    account,
    books,
    outline,
    generation,
    chapters,
    quality,
    design,
    covers,
    assets,
    sources,
    exports,
    distribution,
    listing,
    marketing,
    publishingChecks,
    support,
    operations,
    admin,
    billing,
    localProvider,
  ],
};

mkdirSync(out.replace(/[^/\\]+$/, ""), { recursive: true });
writeFileSync(out, JSON.stringify(collection, null, 2) + "\n", "utf8");

const count = collection.item.reduce(
  (sum, group) => sum + group.item.length,
  0,
);
console.log(`Wrote ${out}`);
console.log(`${collection.item.length} groups, ${count} endpoints.`);
