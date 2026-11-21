import { describe, expect, it } from "vitest";
import { brief, createUser, grantEntitlements, ORIGIN, PAID_ENTITLEMENTS } from "./helpers.js";
import { bookService } from "../src/services/books/bookService.js";
import { prisma } from "../src/database/prisma.js";
import { bookBriefSchema } from "@ebook/shared";

/**
 * S12 entitlement enforcement.
 *
 * Two rules are pinned down here.
 *
 * The first is that a paid capability is decided by the server from the
 * entitlements the author actually holds, and the refusal does not depend on
 * the browser.
 *
 * The second is that the capabilities the product publishes as free are free.
 * The export screen says "Free to export" and the credits screen prices a PDF
 * export at Free, so refusing a free author for the export capability would
 * contradict the product's own promise. Those capabilities are the baseline
 * every author holds, they are never written as entitlements, and a refund
 * cannot take them away.
 */

async function setup(prefix: string) {
  const user = await createUser(prefix);
  const book = await bookService.create(user.user.id, bookBriefSchema.parse(brief({ title: "Entitlement Manual" }).brief));
  return { ...user, book, url: `/api/v1/books/${book.id}` };
}

/** Gives the book a chapter so an export has something to render. */
async function writeAChapter(bookId: string) {
  await prisma.chapter.create({
    data: {
      bookId,
      position: 0,
      title: "Chapter 1",
      status: "done",
      wordCount: 10,
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello." }] }] } as object,
    },
  });
}

describe("entitlement enforcement", () => {
  it("allows an export for an author with no paid plan, because export is free", async () => {
    const a = await setup("free-export");
    await writeAChapter(a.book.id);
    const res = await a.agent.post(`/api/v1/books/${a.book.id}/exports`).set("Origin", ORIGIN).send({ format: "pdf" });
    expect(res.status).toBe(202);
  });

  it("allows a source import for an author with no paid plan, because source import is free", async () => {
    const a = await setup("free-source");
    const res = await a.agent
      .post(`/api/v1/books/${a.book.id}/sources`)
      .set("Origin", ORIGIN)
      .set("Content-Type", "text/markdown")
      .query({ title: "Notes", format: "notes", provenance: "own", license: "own" })
      .send(Buffer.from("# Notes\n\nA passage.\n", "utf8"));
    expect(res.status).toBe(201);
  });

  it("keeps the free capabilities out of the entitlement table", async () => {
    const a = await setup("free-not-written");
    // The free capabilities are the baseline, not something a plan grants, so
    // nothing is written for them.
    await grantEntitlements(a.user.id, PAID_ENTITLEMENTS);
    const rows = await prisma.entitlement.findMany({ where: { userId: a.user.id } });
    expect(rows.map((r) => r.key).sort()).toEqual(["maxBooks", "maxChaptersPerBook", "priorityJobs"]);
  });

  it("still allows an export once the plan carries the export capability", async () => {
    const a = await setup("paid-export");
    await grantEntitlements(a.user.id, PAID_ENTITLEMENTS);
    await writeAChapter(a.book.id);
    const res = await a.agent.post(`/api/v1/books/${a.book.id}/exports`).set("Origin", ORIGIN).send({ format: "pdf" });
    expect(res.status).toBe(202);
  });

  it("still allows a source import once the plan carries the import capability", async () => {
    const a = await setup("paid-source");
    await grantEntitlements(a.user.id, PAID_ENTITLEMENTS);
    const res = await a.agent
      .post(`/api/v1/books/${a.book.id}/sources`)
      .set("Origin", ORIGIN)
      .set("Content-Type", "text/markdown")
      .query({ title: "Notes", format: "notes", provenance: "own", license: "own" })
      .send(Buffer.from("# Notes\n\nA passage.\n", "utf8"));
    expect(res.status).toBe(201);
  });

  it("refuses a book beyond the plan's book quota", async () => {
    const a = await setup("quota-books");
    // A plan that includes two books.
    await grantEntitlements(a.user.id, { maxBooks: 2 });

    const second = await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Second" }).brief));
    expect(second.id).toBeTruthy();

    // The third is refused, and the refusal names the limit.
    let refusal: unknown = null;
    try {
      await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Third" }).brief));
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeTruthy();
    expect((refusal as { status: number }).status).toBe(403);
    expect((refusal as { message: string }).message).toContain("2 books");

    // Only the two allowed books exist.
    expect(await prisma.book.count({ where: { userId: a.user.id, deletedAt: null } })).toBe(2);
  });

  it("does not apply a quota to an author with no plan", async () => {
    const a = await setup("no-quota");
    // No entitlements at all: the free tier has no paid quota, so it is not
    // limited by one.
    await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Second" }).brief));
    await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Third" }).brief));
    expect(await prisma.book.count({ where: { userId: a.user.id, deletedAt: null } })).toBe(3);
  });

  it("frees a quota slot when a book is archived", async () => {
    const a = await setup("quota-archive");
    // A plan that allows two books: one is already live.
    await grantEntitlements(a.user.id, { maxBooks: 2 });
    const second = await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Second" }).brief));
    expect(second.id).toBeTruthy();

    // The plan allows two books and two are live, so a third is refused.
    await expect(
      bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Third" }).brief)),
    ).rejects.toThrow();

    // Archiving a live book frees a slot.
    await prisma.book.update({ where: { id: a.book.id }, data: { archivedAt: new Date() } });
    const third = await bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Third" }).brief));
    expect(third.id).toBeTruthy();
  });

  it("refuses an outline that would exceed the plan's chapter quota", async () => {
    const a = await setup("quota-chapters");
    // A plan that allows two chapters in a book.
    await grantEntitlements(a.user.id, { ...PAID_ENTITLEMENTS, maxChaptersPerBook: 2 });

    const outline = await prisma.outline.create({
      data: {
        bookId: a.book.id,
        version: 1,
        data: {
          title: "A Manual",
          subtitle: "",
          audience: "",
          promise: "",
          chapters: [
            { title: "One", goal: "g", keyPoints: [], targetWords: 400 },
            { title: "Two", goal: "g", keyPoints: [], targetWords: 400 },
            { title: "Three", goal: "g", keyPoints: [], targetWords: 400 },
          ],
        } as object,
      },
    });

    const res = await a.agent
      .post(`/api/v1/books/${a.book.id}/outline/approve`)
      .set("Origin", ORIGIN)
      .send({ version: outline.version });
    expect(res.status).toBe(403);
    // No chapters were created by the refused approval.
    expect(await prisma.chapter.count({ where: { bookId: a.book.id } })).toBe(0);
  });

  it("keeps one author's entitlements from granting another author a quota", async () => {
    const paid = await setup("owner-paid");
    await grantEntitlements(paid.user.id, { maxBooks: 1 });

    const free = await setup("owner-free");
    // The free author holds no quota, so the paid author's limit does not
    // apply to them and a second book is allowed.
    await expect(
      bookService.create(free.user.id, bookBriefSchema.parse(brief({ title: "Second" }).brief)),
    ).resolves.toBeTruthy();
  });

  it("ignores an entitlement that has expired, so its quota no longer applies", async () => {
    const a = await setup("expired-entitlement");
    await grantEntitlements(a.user.id, { maxBooks: 1 });
    // The entitlement has passed its expiry, so it grants nothing.
    await prisma.entitlement.updateMany({
      where: { userId: a.user.id, key: "maxBooks" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      bookService.create(a.user.id, bookBriefSchema.parse(brief({ title: "Second" }).brief)),
    ).resolves.toBeTruthy();
  });
});
