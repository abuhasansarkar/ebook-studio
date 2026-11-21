import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { createUser, PAID_ENTITLEMENTS, grantEntitlements } from "./helpers.js";
import { storage } from "../src/services/storage/storage.js";
import { Readable } from "node:stream";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * S14 distribution package tests.
 *
 * These cover the two rules the package exists for: a package carries only
 * the author's own files, and a package that cannot satisfy the destination's
 * rules is refused rather than assembled.
 */

/** Creates a book with one finished chapter. */
async function createBook(userId: string) {
  const book = await prisma.book.create({
    data: {
      userId,
      title: "The Practical Guide",
      language: "en",
      status: "written",
      brief: {
        create: {
          data: {
            topic: "Storing food safely",
            authorName: "A. Tester",
            audience: "Home cooks",
            tone: "plain",
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
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep food below four degrees." }] }] } as object,
    },
  });
  return book;
}

/**
 * Records a ready export with a small stored file.
 *
 * The export row is what the package reads. Writing a real file to storage
 * keeps the package path the same as it is in production.
 */
async function createReadyExport(userId: string, bookId: string, format: "pdf" | "epub" | "docx", body: string) {
  const storageKey = `test-exports/${userId}/${bookId}/${format}-${Date.now()}.${format}`;
  await storage.put(storageKey, Buffer.from(body, "utf8"), "application/octet-stream");
  const row = await prisma.export.create({
    data: {
      userId,
      bookId,
      format,
      status: "ready",
      storageKey,
      fileSize: Buffer.byteLength(body),
      contentType: "application/octet-stream",
      sha256: "test",
      snapshot: {} as object,
    },
  });
  return row;
}

/** Reads the entries of a stored ZIP by looking for the local file headers. */
function zipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];
  const text = buffer.toString("latin1");
  const pattern = /PK\x03\x04/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const nameLength = buffer.readUInt16LE(start + 26);
    const name = buffer.subarray(start + 30, start + 30 + nameLength).toString("utf8");
    names.push(name);
  }
  return names;
}

describe("S14 distribution packages", () => {
  it("assembles a package for a destination from the author's own exports", async () => {
    const author = await createUser("s14-author");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);
    const epub = await createReadyExport(author.user.id, book.id, "epub", "epub-body");

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "kdp_ebook",
      exportIds: [epub.id],
      metadata: {
        title: "The Practical Guide",
        author: "A. Tester",
        language: "en",
      },
    });

    expect(res.status).toBe(201);
    const pkg = res.body.package;
    expect(pkg.status).toBe("ready");
    expect(pkg.destination).toBe("kdp_ebook");
    expect(pkg.rulesVersion).toBeTruthy();
    expect(pkg.chapterVersions.length).toBeGreaterThan(0);
    expect(pkg.files.some((f: { format: string }) => f.format === "epub")).toBe(true);
    expect(pkg.files.some((f: { path: string }) => f.path === "README.txt")).toBe(true);

    // The download is a ZIP, so the response is read as a buffer rather than
    // being parsed as JSON.
    const download = await author.agent
      .get(`/api/v1/distribution/packages/${pkg.id}/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("application/zip");

    const names = zipEntryNames(download.body as Buffer);
    expect(names).toContain("the-practical-guide.epub");
    expect(names).toContain("README.txt");
  }, 60_000);

  it("refuses a package that is missing a format the destination requires", async () => {
    const author = await createUser("s14-missing");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);
    const pdf = await createReadyExport(author.user.id, book.id, "pdf", "pdf-body");

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "kdp_ebook",
      exportIds: [pdf.id],
      metadata: { title: "The Practical Guide", author: "A. Tester", language: "en" },
    });

    expect(res.status).toBe(422);
    expect(res.body.package.status).toBe("blocked");
    expect(res.body.package.error).toMatch(/EPUB/i);
  }, 60_000);

  it("refuses a package that uses another author's export", async () => {
    const author = await createUser("s14-owner");
    const other = await createUser("s14-other");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    await grantEntitlements(other.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);
    const otherBook = await createBook(other.user.id);
    const foreign = await createReadyExport(other.user.id, otherBook.id, "epub", "foreign");

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "kdp_ebook",
      exportIds: [foreign.id],
      metadata: { title: "The Practical Guide", author: "A. Tester", language: "en" },
    });

    expect(res.status).toBe(404);
  }, 60_000);

  it("refuses a package for a book the author does not own", async () => {
    const author = await createUser("s14-a");
    const other = await createUser("s14-b");
    await grantEntitlements(other.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(other.user.id);

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "kdp_ebook",
      exportIds: ["some-export"],
      metadata: { title: "The Practical Guide", author: "A. Tester", language: "en" },
    });

    expect(res.status).toBe(404);
  });

  it("refuses to download another author's package", async () => {
    const author = await createUser("s14-dl-a");
    const other = await createUser("s14-dl-b");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);
    const epub = await createReadyExport(author.user.id, book.id, "epub", "epub-body");

    const created = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "kdp_ebook",
      exportIds: [epub.id],
      metadata: { title: "The Practical Guide", author: "A. Tester", language: "en" },
    });
    const packageId = created.body.package.id;

    const res = await other.agent.get(`/api/v1/distribution/packages/${packageId}/download`);
    expect(res.status).toBe(404);
  }, 60_000);

  it("records the author's own publishing status", async () => {
    const author = await createUser("s14-status");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/publishing-status`).send({
      destination: "gumroad",
      state: "submitted",
      externalReference: "gumroad-abc123",
      note: "Submitted the EPUB.",
    });
    expect(res.status).toBe(200);
    expect(res.body.status.state).toBe("submitted");

    const listed = await author.agent.get(`/api/v1/distribution/books/${book.id}/publishing-status`);
    expect(listed.status).toBe(200);
    const entry = listed.body.statuses.find((s: { destination: string }) => s.destination === "gumroad");
    expect(entry.state).toBe("submitted");
    expect(entry.externalReference).toBe("gumroad-abc123");
  });

  it("lists the destinations and the rules each one applies", async () => {
    const res = await createUser("s14-dest").then((author) => author.agent.get("/api/v1/distribution/destinations"));
    expect(res.status).toBe(200);
    const destinations = res.body.destinations.map((d: { destination: string }) => d.destination);
    expect(destinations).toContain("kdp_ebook");
    expect(destinations).toContain("kdp_print");
    expect(destinations).toContain("apple_books");
    expect(destinations).toContain("etsy");
    expect(destinations).toContain("gumroad");
    expect(destinations).toContain("direct");

    const etsy = res.body.destinations.find((d: { destination: string }) => d.destination === "etsy");
    expect(etsy.maxFileBytes).toBe(20 * 1024 * 1024);
  });

  it("refuses a destination it does not support", async () => {
    const author = await createUser("s14-bad-dest");
    await grantEntitlements(author.user.id, PAID_ENTITLEMENTS);
    const book = await createBook(author.user.id);

    const res = await author.agent.post(`/api/v1/distribution/books/${book.id}/packages`).send({
      destination: "barnes_and_noble",
      exportIds: ["x"],
      metadata: { title: "T", author: "A", language: "en" },
    });
    expect(res.status).toBe(400);
  });
});
