import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { createUser } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * Marketplace listing copy tests.
 *
 * These cover the three rules the feature exists for: the listing is drafted
 * from the author's own manuscript, the author's edits are preserved, and the
 * royalty figure is the store's published rate rather than an invented one.
 */

/** Creates a book with one finished chapter and a brief. */
async function createBook(userId: string) {
  const book = await prisma.book.create({
    data: {
      userId,
      title: "The Practical Guide",
      subtitle: "A calm approach to the everyday",
      language: "en",
      status: "written",
      brief: {
        create: {
          data: {
            topic: "Storing food safely",
            authorName: "A. Tester",
            targetAudience: "Home cooks",
            tone: "friendly",
          } as object,
        },
      },
    },
  });
  await prisma.chapter.create({
    data: {
      bookId: book.id,
      position: 1,
      title: "Cold storage",
      status: "done",
      wordCount: 800,
      summary: "How to store food so it stays safe for longer.",
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Keep food below four degrees." }] }],
      } as object,
    },
  });
  return book;
}

describe("marketplace listing copy", () => {
  it("prepares a listing from the author's own manuscript", async () => {
    const author = await createUser("listing-author");
    const book = await createBook(author.user.id);

    const res = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });

    expect(res.status).toBe(201);
    const listing = res.body.listing;
    expect(listing.destination).toBe("kdp_ebook");
    expect(listing.rulesVersion).toBeTruthy();
    expect(listing.sourceChapterVersions.length).toBe(1);

    // The fields the store's form asks for are all present, and the ones the
    // product can copy from the book carry the author's own values.
    const byKey = Object.fromEntries(listing.fields.map((f: { key: string; value: string }) => [f.key, f.value]));
    expect(byKey.title).toBe("The Practical Guide");
    expect(byKey.subtitle).toBe("A calm approach to the everyday");
    expect(byKey.author).toBe("A. Tester");
    expect(byKey.description).toContain("Storing food safely");
  }, 60_000);

  it("charges the stated credits and leaves the ledger reconcilable", async () => {
    const author = await createUser("listing-credits");
    const book = await createBook(author.user.id);

    const before = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });
    const res = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    expect(res.status).toBe(201);

    const after = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });
    expect((before?.balance ?? 0) - (after?.balance ?? 0)).toBe(3);
    expect(after?.reserved ?? 0).toBe(0);
  }, 60_000);

  it("estimates the royalty at the store's published rate", async () => {
    const author = await createUser("listing-royalty");
    const book = await createBook(author.user.id);

    const res = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });

    const royalty = res.body.listing.royalty;
    expect(royalty.priceInMinorUnits).toBe(599);
    expect(royalty.authorShareRate).toBe(0.7);
    expect(royalty.authorShareInMinorUnits).toBe(419);
    expect(royalty.source).toMatch(/^https?:\/\//);
  }, 60_000);

  it("quotes a royalty without spending credits", async () => {
    const author = await createUser("listing-quote");
    const before = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });

    const res = await author.agent
      .post("/api/v1/listings/royalty-quote")
      .send({ destination: "gumroad", priceInMinorUnits: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.quote.authorShareInMinorUnits).toBe(900);

    const after = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });
    expect((before?.balance ?? 0) - (after?.balance ?? 0)).toBe(0);
  }, 60_000);

  it("keeps the author's edit when the listing is saved", async () => {
    const author = await createUser("listing-edit");
    const book = await createBook(author.user.id);

    const created = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    const listing = created.body.listing;

    const res = await author.agent
      .patch(`/api/v1/listings/${listing.id}`)
      .send({
        baseVersion: 1,
        fields: { description: "The description the author wrote." },
        confirmed: { description: true },
      });

    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.listing.fields.map((f: { key: string; value: string }) => [f.key, f.value]));
    expect(byKey.description).toBe("The description the author wrote.");
    // The fields the author did not touch are still there.
    expect(byKey.title).toBe("The Practical Guide");
    const confirmed = res.body.listing.fields.find((f: { key: string }) => f.key === "description");
    expect(confirmed.confirmed).toBe(true);
  }, 60_000);

  it("refuses a lost edit rather than overwriting a newer save", async () => {
    const author = await createUser("listing-conflict");
    const book = await createBook(author.user.id);

    const created = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    const listing = created.body.listing;

    const first = await author.agent
      .patch(`/api/v1/listings/${listing.id}`)
      .send({ baseVersion: 1, fields: { description: "First save." } });
    expect(first.status).toBe(200);

    // The second save carries the version the first save replaced.
    const stale = await author.agent
      .patch(`/api/v1/listings/${listing.id}`)
      .send({ baseVersion: 1, fields: { description: "Second save." } });

    expect(stale.status).toBe(409);
    expect(stale.body.error.details.code).toBe("STALE_VERSION");

    // The first save is still what the listing holds.
    const after = await author.agent.get(`/api/v1/listings/${listing.id}`);
    const byKey = Object.fromEntries(after.body.listing.fields.map((f: { key: string; value: string }) => [f.key, f.value]));
    expect(byKey.description).toBe("First save.");
  }, 60_000);

  it("refuses a listing for a book with no manuscript", async () => {
    const author = await createUser("listing-empty");
    const book = await prisma.book.create({
      data: { userId: author.user.id, title: "Nothing yet", language: "en", status: "draft" },
    });

    const res = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });

    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("NO_MANUSCRIPT");
  }, 60_000);

  it("keeps a listing private to its author", async () => {
    const author = await createUser("listing-owner");
    const other = await createUser("listing-other");
    const book = await createBook(author.user.id);

    const created = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    const listing = created.body.listing;

    const read = await other.agent.get(`/api/v1/listings/${listing.id}`);
    expect(read.status).toBe(404);

    const list = await other.agent.get(`/api/v1/listings/books/${book.id}`);
    expect(list.status).toBe(404);

    const edit = await other.agent
      .patch(`/api/v1/listings/${listing.id}`)
      .send({ baseVersion: 1, fields: { description: "Not yours." } });
    expect(edit.status).toBe(404);
  }, 60_000);

  it("reports the required fields a listing is still missing", async () => {
    const author = await createUser("listing-gaps");
    const book = await createBook(author.user.id);

    const created = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    const listing = created.body.listing;

    const res = await author.agent.get(`/api/v1/listings/${listing.id}/gaps`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.missing)).toBe(true);
    expect(res.body.stale).toBe(false);
  }, 60_000);

  it("marks a listing stale when the manuscript moves on", async () => {
    const author = await createUser("listing-stale");
    const book = await createBook(author.user.id);

    const created = await author.agent
      .post(`/api/v1/listings/books/${book.id}`)
      .send({ destination: "kdp_ebook", priceInMinorUnits: 599 });
    const listing = created.body.listing;

    // The chapter moves on, so the listing describes a book that is no longer
    // the one in the manuscript.
    await prisma.chapter.updateMany({ where: { bookId: book.id }, data: { version: { increment: 1 } } });

    const res = await author.agent.get(`/api/v1/listings/${listing.id}/gaps`);
    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(true);
  }, 60_000);

  it("lists the destination profiles with their fields and rates", async () => {
    const author = await createUser("listing-destinations");
    const res = await author.agent.get("/api/v1/listings/destinations");

    expect(res.status).toBe(200);
    const destinations = res.body.destinations.map((d: { destination: string }) => d.destination);
    expect(destinations).toEqual(expect.arrayContaining(["kdp_ebook", "etsy", "gumroad"]));
    const kdp = res.body.destinations.find((d: { destination: string }) => d.destination === "kdp_ebook");
    expect(kdp.fields.length).toBeGreaterThan(0);
    expect(kdp.source).toMatch(/^https?:\/\//);
  }, 60_000);
});
