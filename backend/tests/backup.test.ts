import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { createBackup, getBackup, listBackups, rehearseRestore } from "../src/services/admin/backupService.js";
import { createUser } from "./helpers.js";

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

/**
 * S13 backup and restore tests.
 *
 * A backup that has never been restored is a guess, so these tests take one,
 * verify the checksum, and rehearse the restore into an isolated database.
 * The rehearsal must leave the live database untouched.
 */

describe("S13 backups", () => {
  it("takes a backup and records its checksums and counts", async () => {
    const customer = await createUser("s13-backup");
    const before = await prisma.book.count();

    const backup = await createBackup({ name: `backup-test-${Date.now()}` });

    expect(backup.databaseSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(backup.bytes).toBeGreaterThan(0);
    expect(backup.counts.books).toBe(before);
    expect(backup.counts.users).toBeGreaterThan(0);

    const stored = await getBackup(backup.name);
    expect(stored.databaseSha256).toBe(backup.databaseSha256);
    expect(stored.restoredAt).toBeNull();
    expect(stored.restoreVerified).toBe(false);
  }, 120_000);

  it("lists the backups it has taken", async () => {
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThan(0);
    expect(backups[0].name).toBeTruthy();
  });

  it("rehearses the restore into an isolated database and leaves the live one alone", async () => {
    const customer = await createUser("s13-restore");
    const liveBefore = await prisma.user.count();

    const backup = await createBackup({ name: `backup-restore-${Date.now()}` });
    const result = await rehearseRestore(backup.name);

    expect(result.verified).toBe(true);
    expect(result.targetDatabase).toContain("_restore_");
    expect(result.observed.users).toBe(result.expected.users);
    expect(result.observed.books).toBe(result.expected.books);
    expect(result.observed.chapters).toBe(result.expected.chapters);

    // The live database is untouched by the rehearsal.
    expect(await prisma.user.count()).toBe(liveBefore);

    const stored = await getBackup(backup.name);
    expect(stored.restoreVerified).toBe(true);
    expect(stored.restoredAt).toBeTruthy();
    expect(stored.restoredInto).toBe(result.targetDatabase);
  }, 180_000);

  it("refuses a restore whose dump no longer matches its checksum", async () => {
    const backup = await createBackup({ name: `backup-tamper-${Date.now()}` });

    // The dump is altered after the manifest recorded its checksum.
    const manifest = await prisma.backupManifest.findUniqueOrThrow({ where: { name: backup.name } });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(manifest.databaseFile, "-- this is no longer the dump that was checksummed\n", "utf8");

    await expect(rehearseRestore(backup.name)).rejects.toThrow(/checksum/i);

    const stored = await getBackup(backup.name);
    expect(stored.restoreVerified).toBe(false);
    expect(stored.restoreNotes).toMatch(/checksum/i);
  }, 120_000);

  it("refuses a restore of a backup that does not exist", async () => {
    await expect(rehearseRestore("no-such-backup")).rejects.toThrow();
  });
});
