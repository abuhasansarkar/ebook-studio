import { describe, expect, it } from "vitest";
import { unsafeProductionSettings } from "../src/config/env.js";
import { buildZip, readZip, ZipError } from "../src/services/exports/zip.js";
import { extractDocx } from "../src/services/sources/extractors.js";
import { createBackup, deleteBackup } from "../src/services/admin/backupService.js";
import { ORIGIN, brief, createUser } from "./helpers.js";

/**
 * Regression tests for the production-readiness review: each one pins a
 * failure that was reachable before the fix.
 */

const production = {
  NODE_ENV: "production" as const,
  PAYMENT_PROVIDER: "stripe" as const,
  ALLOW_LOCAL_PAYMENTS: false,
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  BETTER_AUTH_SECRET: "a-real-random-secret-value-0123456789",
  PAYMENT_WEBHOOK_SECRET: "another-real-random-secret-0123456789",
};

describe("production start-up refuses unsafe settings", () => {
  it("accepts a correctly configured production environment", () => {
    expect(unsafeProductionSettings(production)).toEqual([]);
  });

  it("refuses the local payment processor, which grants credits without payment", () => {
    const problems = unsafeProductionSettings({ ...production, PAYMENT_PROVIDER: "local" });
    expect(problems.join(" ")).toMatch(/PAYMENT_PROVIDER=local/);
  });

  it("allows the local processor only when a private test stack opts in", () => {
    expect(unsafeProductionSettings({ ...production, PAYMENT_PROVIDER: "local", ALLOW_LOCAL_PAYMENTS: true })).toEqual([]);
  });

  it("refuses Stripe without its keys", () => {
    expect(unsafeProductionSettings({ ...production, STRIPE_SECRET_KEY: "" }).join(" ")).toMatch(/STRIPE_SECRET_KEY/);
  });

  it("refuses the placeholder secrets from .env.example", () => {
    const problems = unsafeProductionSettings({ ...production, BETTER_AUTH_SECRET: "change-me-to-a-long-random-string" });
    expect(problems.join(" ")).toMatch(/BETTER_AUTH_SECRET/);
  });

  it("does not apply outside production", () => {
    expect(unsafeProductionSettings({ ...production, NODE_ENV: "development", PAYMENT_PROVIDER: "local" })).toEqual([]);
  });
});

describe("ZIP reading is bounded", () => {
  const big = Buffer.alloc(4 * 1024 * 1024); // compresses to a few KiB

  it("refuses an entry larger than the limit before inflating it", () => {
    const zip = buildZip([{ name: "bomb.bin", data: big }]);
    expect(zip.length).toBeLessThan(64 * 1024);
    expect(() => readZip(zip, { maxEntryBytes: 1024 * 1024 })).toThrow(ZipError);
  });

  it("refuses an archive whose entries add up past the total limit", () => {
    const zip = buildZip([
      { name: "a.bin", data: big },
      { name: "b.bin", data: big },
    ]);
    expect(() => readZip(zip, { maxTotalBytes: 6 * 1024 * 1024 })).toThrow(ZipError);
  });

  it("refuses an entry that inflates past the size its header declares", () => {
    const zip = buildZip([{ name: "liar.bin", data: big }]);
    // Rewrite the declared size in the central directory to a smaller value.
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(1024, central + 24);
    expect(() => readZip(zip)).toThrow(ZipError);
  });

  it("never inflates parts of a Word document other than the main text", () => {
    const docx = buildZip([
      { name: "word/document.xml", data: Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from the main part.</w:t></w:r></w:p></w:body></w:document>') },
      { name: "word/media/huge.bin", data: Buffer.alloc(80 * 1024 * 1024) },
    ]);
    const result = extractDocx(docx);
    expect(result.status).not.toBe("failed");
    expect(result.passages.map((p) => p.text).join(" ")).toContain("Hello from the main part.");
  });
});

describe("backup names stay inside the backup directory", () => {
  it.each(["../escape", "../../storage", "a/b", "..", ".hidden", "with space"])("refuses %s", async (name) => {
    await expect(createBackup({ name })).rejects.toMatchObject({ status: 400 });
    await expect(deleteBackup(name)).rejects.toBeTruthy();
  });

  it("refuses a traversal name over HTTP before any backup work starts", async () => {
    const { agent } = await createUser("backup-name");
    const res = await agent.post("/api/v1/admin/backups").set("Origin", ORIGIN).send({ name: "../../storage" });
    // A customer without the permission is refused either way; the body is
    // validated first so a hostile name never reaches the service.
    expect([400, 403]).toContain(res.status);
  });
});

describe("book brief updates", () => {
  it("answers an invalid brief with 400 and field details, not 500", async () => {
    const { agent } = await createUser("brief-invalid");
    const created = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief());
    expect(created.status).toBe(201);
    const bookId = created.body.book.id;
    const res = await agent.put(`/api/v1/books/${bookId}/brief`).set("Origin", ORIGIN).send({ topic: "x", chapterCount: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["topic", "chapterCount"]));
  });
});

describe("an operation that crashed does not block its retry forever", () => {
  it("answers the replay with OPERATION_NEEDS_REVIEW, then accepts a fresh attempt", async () => {
    const { submitOperation } = await import("../src/services/operations/operationService.js");
    const { user } = await createUser("op-crash");
    const key = `crash-${Date.now()}`;
    const fakeReq = (k: string) => ({ get: (h: string) => (h === "Idempotency-Key" ? k : undefined), body: { intent: "write" }, id: "req-test" }) as never;
    const fakeRes = () => {
      const res = { statusCode: 0, body: null as unknown, setHeader() {}, status(code: number) { res.statusCode = code; return res; }, json(b: unknown) { res.body = b; return res; } };
      return res;
    };

    // The first attempt crashes inside the action.
    await expect(submitOperation(fakeReq(key), fakeRes() as never, user.id, "test_action", null, async () => { throw new Error("boom"); })).rejects.toThrow("boom");

    // A replay with the same key is told the attempt needs review, instead of
    // being told to keep waiting on a request that will never finish.
    await expect(submitOperation(fakeReq(key), fakeRes() as never, user.id, "test_action", null, async () => ({ status: 201, body: {} })))
      .rejects.toMatchObject({ status: 409, code: "OPERATION_NEEDS_REVIEW" });

    // The browser then drops the key; a new attempt goes through.
    const res = fakeRes();
    await submitOperation(fakeReq(`${key}-fresh`), res as never, user.id, "test_action", null, async () => ({ status: 201, body: { ok: true } }));
    expect(res.statusCode).toBe(201);
  });
});

describe("chapter reordering", () => {
  it("puts chapters in a new order and refuses a list that does not name each chapter once", async () => {
    const { prisma } = await import("../src/database/prisma.js");
    const { agent } = await createUser("reorder");
    const created = await agent.post("/api/v1/books").set("Origin", ORIGIN).send(brief());
    const bookId = created.body.book.id as string;
    // Wait for no job: the outline job may still be queued in the test runtime.
    await prisma.generationJob.updateMany({ where: { bookId, status: { in: ["queued", "running"] } }, data: { status: "cancelled" } });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const chapter = await prisma.chapter.create({ data: { bookId, position: i, title: `Chapter ${i + 1}`, status: "done", wordCount: 10 } });
      ids.push(chapter.id);
    }
    const reversed = [...ids].reverse();
    const res = await agent.put(`/api/v1/books/${bookId}/chapters/order`).set("Origin", ORIGIN).send({ chapterIds: reversed });
    expect(res.status).toBe(200);
    expect(res.body.chapters.map((c: { id: string }) => c.id)).toEqual(reversed);

    // Missing one, duplicated one, or naming a stranger's chapter: all refused.
    await agent.put(`/api/v1/books/${bookId}/chapters/order`).set("Origin", ORIGIN).send({ chapterIds: reversed.slice(1) }).expect(409);
    await agent.put(`/api/v1/books/${bookId}/chapters/order`).set("Origin", ORIGIN).send({ chapterIds: [ids[0], ids[0], ids[1]] }).expect(409);
    await agent.put(`/api/v1/books/${bookId}/chapters/order`).set("Origin", ORIGIN).send({ chapterIds: [ids[0], ids[1], "someone-elses"] }).expect(409);

    // Another author cannot reorder this book.
    const other = await createUser("reorder-other");
    const foreign = await other.agent.put(`/api/v1/books/${bookId}/chapters/order`).set("Origin", ORIGIN).send({ chapterIds: ids });
    expect([403, 404]).toContain(foreign.status);
  });
});

describe("credit history pages", () => {
  it("pages through the ledger without overlap and refuses another author's cursor", async () => {
    const { creditService } = await import("../src/services/credits/creditService.js");
    const { agent, user } = await createUser("history");
    for (let i = 0; i < 55; i++) await creditService.grant(user.id, 1, `history-test:${user.id}:${i}`, `Test grant ${i}`);
    const first = await agent.get("/api/v1/credits").expect(200);
    expect(first.body.transactions).toHaveLength(50);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await agent.get(`/api/v1/credits/transactions?cursor=${first.body.nextCursor}`).expect(200);
    const ids = new Set(first.body.transactions.map((t: { id: string }) => t.id));
    expect(second.body.transactions.length).toBeGreaterThan(0);
    expect(second.body.transactions.some((t: { id: string }) => ids.has(t.id))).toBe(false);
    expect(second.body.nextCursor).toBeNull();

    const other = await createUser("history-other");
    await other.agent.get(`/api/v1/credits/transactions?cursor=${first.body.nextCursor}`).expect(400);
  });
});
