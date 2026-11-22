import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { createBackup, getBackup, listBackups, pgConnection, rehearseRestore } from "../src/services/admin/backupService.js";
import { createUser } from "./helpers.js";

// Backups hold full database dumps (password hashes, sessions). They are
// written to a throwaway directory, never the repository's backend/backups,
// and removed afterwards. This runs before the service reads BACKUP_DIR.
const backupDir = vi.hoisted(() => {
  const dir = `${(process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "")}/ebook-backup-test-${process.pid}-${Date.now()}`;
  process.env.BACKUP_DIR = dir;
  return dir;
});

afterAll(async () => {
  await prisma.backupManifest.deleteMany({ where: { databaseFile: { startsWith: backupDir } } });
  await rm(backupDir, { recursive: true, force: true });
  await closeQueues();
  await prisma.$disconnect();
});

describe("backup connection", () => {
  it("connects with the application's DATABASE_URL, keeping libpq options and dropping Prisma-only ones", () => {
    const c = pgConnection("postgresql://app:s%40cret@db.internal:6543/ebook?schema=public&sslmode=require&connection_limit=5", "ebook_restore_x");
    expect(c.args[0]).toBe("--dbname");
    const url = new URL(c.args[1]);
    expect(url.hostname).toBe("db.internal");
    expect(url.port).toBe("6543");
    expect(url.username).toBe("app");
    expect(url.pathname).toBe("/ebook_restore_x");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.has("schema")).toBe(false);
    expect(url.searchParams.has("connection_limit")).toBe(false);
    // The password is passed in the environment, never on the command line.
    expect(c.args.join(" ")).not.toContain("s@cret");
    expect(c.env).toEqual({ PGPASSWORD: "s@cret" });
  });
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
    await createUser("s13-backup");
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
    // Written under the throwaway directory, not the repository.
    const manifest = await prisma.backupManifest.findUniqueOrThrow({ where: { name: backup.name } });
    expect(manifest.databaseFile.startsWith(backupDir)).toBe(true);
    expect(existsSync(manifest.databaseFile)).toBe(true);
  }, 120_000);

  it("lists the backups it has taken", async () => {
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThan(0);
    expect(backups[0].name).toBeTruthy();
  });

  it("rehearses the restore into an isolated database and leaves the live one alone", async () => {
    await createUser("s13-restore");
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
