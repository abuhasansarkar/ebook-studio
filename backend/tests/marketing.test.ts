import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "../src/database/prisma.js";
import { storage } from "../src/services/storage/storage.js";
import { closeQueues } from "../src/queues/index.js";
import { createUser } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * S15 marketing studio tests.
 *
 * These cover the rules the studio exists to hold: a draft stays editable, a
 * regeneration never overwrites a manual edit, a draft that no longer matches
 * the manuscript is marked stale, and nothing is published anywhere.
 */

/** Creates a book with one written chapter. */
async function createBook(userId: string) {
  const book = await prisma.book.create({
    data: {
      userId,
      title: "The Practical Guide",
      subtitle: "Storing food safely at home",
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
      summary: "How to store food below four degrees.",
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep food cold." }] }] } as object,
    },
  });
  return book;
}

describe("S15 marketing studio", () => {
  it("lists the output types and what each one costs", async () => {
    const author = await createUser("s15-list");
    const res = await author.agent.get("/api/v1/marketing/outputs");
    expect(res.status).toBe(200);
    const outputs = res.body.outputs.map((o: { outputType: string }) => o.outputType);
    expect(outputs).toContain("description");
    expect(outputs).toContain("keywords");
    expect(outputs).toContain("carousel_outline");
    for (const output of res.body.outputs) {
      expect(output.credits).toBeGreaterThan(0);
      expect(output.label).toBeTruthy();
    }
  });

  it("drafts a description and charges the stated credits", async () => {
    const author = await createUser("s15-draft");
    const book = await createBook(author.user.id);
    const walletBefore = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });
    const before = walletBefore?.balance ?? 0;

    const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({
      outputType: "description",
      tone: "warm",
      audience: "Busy parents",
    });

    expect(res.status).toBe(201);
    const draft = res.body.draft;
    expect(draft.status).toBe("draft");
    expect(draft.content.length).toBeGreaterThan(0);
    expect(draft.tone).toBe("warm");
    expect(draft.audience).toBe("Busy parents");
    expect(draft.creditsCharged).toBeGreaterThan(0);
    expect(draft.chapterVersions.length).toBeGreaterThan(0);
    expect(draft.stale).toBe(false);

    const walletAfter = await prisma.creditWallet.findUnique({ where: { userId: author.user.id } });
    expect(walletAfter!.balance).toBe(before - draft.creditsCharged);
  });

  it("keeps a manual edit and refuses a lost edit", async () => {
    const author = await createUser("s15-edit");
    const book = await createBook(author.user.id);

    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "summary" });
    const draftId = created.body.draft.id;

    const saved = await author.agent.patch(`/api/v1/marketing/drafts/${draftId}`).send({
      content: "My own words, edited by hand.",
      baseVersion: 1,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.draft.content).toBe("My own words, edited by hand.");
    expect(saved.body.draft.status).toBe("edited");

    // An edit based on the old version is refused.
    const stale = await author.agent.patch(`/api/v1/marketing/drafts/${draftId}`).send({
      content: "Something that overwrites the edit.",
      baseVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.code).toBe("STALE_VERSION");

    const current = await author.agent.get(`/api/v1/marketing/drafts/${draftId}`);
    expect(current.body.draft.content).toBe("My own words, edited by hand.");
  });

  it("marks a draft as approved only when the author says so", async () => {
    const author = await createUser("s15-approve");
    const book = await createBook(author.user.id);
    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "author_bio" });

    const approved = await author.agent.patch(`/api/v1/marketing/drafts/${created.body.draft.id}`).send({
      content: "The approved biography.",
      approve: true,
    });
    expect(approved.body.draft.status).toBe("approved");
  });

  it("regenerates into a new variant and leaves the edited draft alone", async () => {
    const author = await createUser("s15-regen");
    const book = await createBook(author.user.id);

    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "sales_copy" });
    const draftId = created.body.draft.id;
    await author.agent.patch(`/api/v1/marketing/drafts/${draftId}`).send({ content: "My edited copy." });

    const regenerated = await author.agent.post(`/api/v1/marketing/drafts/${draftId}/regenerate`);
    expect(regenerated.status).toBe(201);
    expect(regenerated.body.draft.id).not.toBe(draftId);

    const original = await author.agent.get(`/api/v1/marketing/drafts/${draftId}`);
    expect(original.body.draft.content).toBe("My edited copy.");
  });

  it("marks a draft stale when the manuscript moves on", async () => {
    const author = await createUser("s15-stale");
    const book = await createBook(author.user.id);
    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "description" });
    expect(created.body.draft.stale).toBe(false);

    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId: book.id } });
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        version: { increment: 1 },
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Revised." }] }] } as object,
      },
    });

    const after = await author.agent.get(`/api/v1/marketing/drafts/${created.body.draft.id}`);
    expect(after.body.draft.stale).toBe(true);
    expect(after.body.draft.flags.some((f: { kind: string }) => f.kind === "stale_input")).toBe(true);
  });

  it("flags a claim that would need proof rather than publishing it", async () => {
    const author = await createUser("s15-flags");
    const book = await createBook(author.user.id);
    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "description" });

    const saved = await author.agent.patch(`/api/v1/marketing/drafts/${created.body.draft.id}`).send({
      content: "This book is guaranteed to change your cooking and is endorsed by every chef.",
    });

    const kinds = saved.body.draft.flags.map((f: { kind: string }) => f.kind);
    expect(kinds).toContain("guarantee");
    expect(kinds).toContain("endorsement");
    // The text is kept, so the author decides what to do with it.
    expect(saved.body.draft.content).toContain("guaranteed");
  });

  it("refuses to draft for a book the author does not own", async () => {
    const author = await createUser("s15-owner");
    const other = await createUser("s15-other");
    const book = await createBook(other.user.id);

    const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "description" });
    expect(res.status).toBe(404);
  });

  it("refuses to read another author's draft", async () => {
    const author = await createUser("s15-read-a");
    const other = await createUser("s15-read-b");
    const book = await createBook(author.user.id);
    const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "description" });

    const res = await other.agent.get(`/api/v1/marketing/drafts/${created.body.draft.id}`);
    expect(res.status).toBe(404);
  });

  it("refuses to draft for a book with no manuscript", async () => {
    const author = await createUser("s15-empty");
    const book = await prisma.book.create({
      data: { userId: author.user.id, title: "Empty book", language: "en" },
    });

    const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/drafts`).send({ outputType: "description" });
    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("NO_MANUSCRIPT");
  });

  it("composes a promotional graphic with the template's own size", async () => {
    const author = await createUser("s15-graphic");
    const book = await createBook(author.user.id);

    const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/graphics`).send({
      template: "square_quote",
      headline: "Store food safely",
      subhead: "A practical guide for the home kitchen",
      callToAction: "Read the first chapter",
    });

    expect(res.status).toBe(201);
    const graphic = res.body.graphic;
    expect(graphic.width).toBe(1080);
    expect(graphic.height).toBe(1080);
    expect(graphic.headline).toBe("Store food safely");
    expect(graphic.usedCover).toBe(true);
  });

  it("refuses a colour that is not a hex value", async () => {
    const author = await createUser("s15-color");
    const book = await createBook(author.user.id);

    const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/graphics`).send({
      template: "square_quote",
      headline: "Hello",
      textColor: "red",
    });
    expect(res.status).toBe(400);
  });

  /**
   * The two downloadable artefacts.
   *
   * A promotional graphic is an image the author downloads, and a sample pack
   * is a file the author hands out. Both are produced locally, and neither is
   * published, emailed or posted anywhere.
   */
  describe("the downloadable artefacts", () => {
    it("renders a promotional graphic to a real image", async () => {
      const author = await createUser("s15-render");
      const book = await createBook(author.user.id);

      const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/graphics`).send({
        template: "square_quote",
        headline: "Store food safely",
        subhead: "A practical guide for the home kitchen",
        callToAction: "Read the first chapter",
        useCover: false,
      });
      expect(res.status).toBe(201);

      const graphic = res.body.graphic;
      expect(graphic.ready).toBe(true);
      expect(graphic.storageKey).toBeTruthy();

      // The stored file really is a PNG of the template's own size.
      const stored = await storage.get(graphic.storageKey);
      const info = await sharp(stored).metadata();
      expect(info.format).toBe("png");
      expect(info.width).toBe(1080);
      expect(info.height).toBe(1080);
    });

    it("assembles a sample pack from the chapters the author chose", async () => {
      const author = await createUser("s15-sample");
      const book = await createBook(author.user.id);
      const chapters = await prisma.chapter.findMany({ where: { bookId: book.id }, orderBy: { position: "asc" } });

      const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/samples`).send({
        chapterIds: chapters.map((c) => c.id),
        format: "pdf",
      });
      expect(res.status).toBe(201);

      const sample = res.body.sample;
      expect(sample.ready).toBe(true);
      expect(sample.chapterIds).toEqual(chapters.map((c) => c.id));

      // The file downloads, and it is a real PDF.
      const download = await author.agent.get(`/api/v1/marketing/samples/${sample.id}/download`);
      expect(download.status).toBe(200);
      expect(download.headers["content-type"]).toContain("application/pdf");
      const info = await sharp(Buffer.from(download.body)).metadata().catch(() => null);
      // The PDF opens: it starts with the PDF signature.
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe("%PDF-");
      expect(info === null || info.width > 0).toBe(true);
    });

    it("refuses a sample that names a chapter of another book", async () => {
      const author = await createUser("s15-sample-foreign");
      const book = await createBook(author.user.id);
      const other = await createBook(author.user.id);
      const foreignChapter = await prisma.chapter.findFirstOrThrow({ where: { bookId: other.id } });

      const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/samples`).send({
        chapterIds: [foreignChapter.id],
        format: "pdf",
      });
      expect(res.status).toBe(404);
    });

    it("refuses a sample for a book the author does not own", async () => {
      const author = await createUser("s15-sample-owner");
      const book = await createBook(author.user.id);
      const stranger = await createUser("s15-sample-stranger");
      const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId: book.id } });

      const res = await stranger.agent.post(`/api/v1/marketing/books/${book.id}/samples`).send({
        chapterIds: [chapter.id],
        format: "pdf",
      });
      expect(res.status).toBe(404);
    });

    it("does not let one author download another's sample", async () => {
      const author = await createUser("s15-sample-download");
      const book = await createBook(author.user.id);
      const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId: book.id } });
      const created = await author.agent.post(`/api/v1/marketing/books/${book.id}/samples`).send({
        chapterIds: [chapter.id],
        format: "pdf",
      });
      const sampleId = created.body.sample.id;

      const stranger = await createUser("s15-sample-download-other");
      const res = await stranger.agent.get(`/api/v1/marketing/samples/${sampleId}/download`);
      expect(res.status).toBe(404);
    });

    it("refuses a sample with more chapters than a sample may hold", async () => {
      const author = await createUser("s15-sample-limit");
      const book = await createBook(author.user.id);
      const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId: book.id } });
      // Six chapters, which is one more than a sample may hold.
      const ids = Array.from({ length: 6 }, () => chapter.id);

      const res = await author.agent.post(`/api/v1/marketing/books/${book.id}/samples`).send({
        chapterIds: ids,
        format: "pdf",
      });
      expect(res.status).toBe(400);
    });
  });
});
