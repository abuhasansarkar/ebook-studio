import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/**
 * S13 — backups and the rehearsal of a restore.
 *
 * A backup that has never been restored is a guess. This service takes a
 * backup, records a checksum for every artefact, and can rehearse the restore
 * into an isolated database and report what came back. The rehearsal is the
 * evidence; the manifest without it only says the file was written.
 *
 * The scope is deliberately narrow and honest:
 *
 * - The database is dumped with `pg_dump`, which is the tool the platform
 *   already relies on.
 * - The assets are captured as a directory copy of the storage tree, which is
 *   the local-filesystem backend. A deployment on S3-compatible storage takes
 *   its asset backup with that system's own tooling instead, and the manifest
 *   records that the asset archive was not captured here rather than
 *   pretending it was.
 */

const BACKUP_DIR = path.resolve(env.BACKUP_DIR || path.join(process.cwd(), "backups"));

/** A backup name is one plain path segment: no separators, no `..`. */
export const BACKUP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * The directory a backup lives in, refusing any name that would resolve
 * outside the backup directory. Creation writes there and deletion removes it
 * recursively, so an unchecked name would let either reach any path the
 * process can write.
 */
function backupDirectory(name: string): string {
  if (!BACKUP_NAME.test(name) || name.includes("..")) throw badRequest("A backup name may only use letters, numbers, dots, dashes and underscores.");
  const directory = path.resolve(BACKUP_DIR, name);
  if (path.dirname(directory) !== BACKUP_DIR) throw badRequest("That backup name is not allowed.");
  return directory;
}

/**
 * Where the backup files live inside the PostgreSQL container.
 *
 * The container has its own filesystem, so a file the host wants to keep is
 * written into this directory and copied out afterwards.
 */
const CONTAINER_BACKUP_DIR = "/tmp/ebookstudio-backups";

/**
 * Copies a file out of the PostgreSQL container onto the host.
 *
 * `docker cp` is used rather than piping the file through `cat`, because a
 * dump is binary-ish text and a pipe mangles the line endings on some hosts.
 */
async function copyOutOfContainer(file: string): Promise<void> {
  const name = path.basename(file);
  const result = await run("docker", ["cp", `${PG_CONTAINER}:${CONTAINER_BACKUP_DIR}/${name}`, file]).catch(() => null);
  if (result?.code !== 0) {
    throw new Error(`Could not copy the dump out of the container: ${result?.stderr?.trim() ?? "docker cp failed"}`);
  }
}

/** Copies a file into the PostgreSQL container. */
async function copyIntoContainer(file: string): Promise<void> {
  const name = path.basename(file);
  await ensureContainerDirectory(false);
  await run("docker", ["exec", PG_CONTAINER, "mkdir", "-p", CONTAINER_BACKUP_DIR]).catch(() => null);
  const result = await run("docker", ["cp", file, `${PG_CONTAINER}:${CONTAINER_BACKUP_DIR}/${name}`]).catch(() => null);
  if (result?.code !== 0) {
    throw new Error(`Could not copy the dump into the container: ${result?.stderr?.trim() ?? "docker cp failed"}`);
  }
}

/** The SHA-256 of a buffer. */
function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/** The SHA-256 of a file on disk, read in chunks. */
async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  const { createReadStream } = await import("node:fs");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * The SHA-256 of a directory's contents.
 *
 * The assets are captured as a directory tree, so the checksum has to cover the
 * tree and not a single file. Reading a directory as a stream fails with
 * `EISDIR`, so the tree is walked instead: every file's path and contents are
 * folded into one hash, in sorted order, so the same tree always produces the
 * same digest.
 */
async function sha256Directory(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (current: string, relative: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const from = path.join(current, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(from, name);
      } else if (entry.isFile()) {
        hash.update(name);
        hash.update(await readFile(from));
      }
    }
  };
  await walk(directory, "");
  return hash.digest("hex");
}

/**
 * The PostgreSQL client tools.
 *
 * `pg_dump` and `psql` are not always on the host's PATH: the common
 * deployment runs PostgreSQL in a container and the application outside it.
 * The service therefore looks for the tools in two places — on the host, and
 * inside the container that already holds the database — and uses whichever it
 * finds. When neither is available, the backup fails loudly rather than
 * writing an empty file and calling it a backup.
 */
const PG_CONTAINER = env.PG_CONTAINER || "ebook-studio-postgres-1";

/** Whether a command exists on the host's PATH. */
async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await run(probe, [command]).catch(() => null);
  return result?.code === 0;
}

/** Whether the PostgreSQL container is running and has the tools. */
async function containerHasTools(): Promise<boolean> {
  const result = await run("docker", ["exec", PG_CONTAINER, "sh", "-c", "command -v pg_dump && command -v psql"]).catch(() => null);
  return result?.code === 0;
}

/**
 * Makes sure the backup directory exists inside the container.
 *
 * A previous run may have left a *file* at that path, which would make
 * `pg_dump` fail with a confusing "not a directory" error. The directory is
 * cleared out and recreated, so a stale file cannot block a backup.
 *
 * This is only safe before a dump is written. A restore copies its dump in
 * first and must not have the directory wiped afterwards, so the caller says
 * whether it is preparing to write.
 */
async function ensureContainerDirectory(prepare: boolean): Promise<void> {
  if (!prepare) return;
  await run("docker", ["exec", PG_CONTAINER, "sh", "-c", `rm -rf ${CONTAINER_BACKUP_DIR} && mkdir -p ${CONTAINER_BACKUP_DIR}`]).catch(() => null);
}

/**
 * Runs a PostgreSQL client tool.
 *
 * The tool runs on the host when it is there, and inside the PostgreSQL
 * container otherwise. In the container the file paths are relative to the
 * container's filesystem, so the caller passes a path the container can see.
 */
async function runPgTool(
  tool: "pg_dump" | "psql",
  args: string[],
  options: { env?: NodeJS.ProcessEnv; containerPaths?: Record<string, string> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (await commandExists(tool)) {
    return run(tool, args, { env: options.env });
  }
  if (await containerHasTools()) {
    // The container reads the dump from and writes it to its own filesystem.
    // The path is mapped through `containerPaths`, so the caller names the
    // file in a way both sides understand.
    await ensureContainerDirectory(tool === "pg_dump");
    const mapped = args.map((arg) => {
      for (const [from, to] of Object.entries(options.containerPaths ?? {})) {
        if (arg === from) return to;
        if (arg.startsWith(`${from}=`)) return `${to}=${arg.slice(from.length + 1)}`;
      }
      return arg;
    });
    return run("docker", ["exec", "-e", `PGPASSWORD=${options.env?.PGPASSWORD ?? ""}`, "-i", PG_CONTAINER, tool, ...mapped]);
  }
  throw new Error(
    `${tool} is not available. Install the PostgreSQL client tools on the host, or set PG_CONTAINER to the container that has them.`,
  );
}

/** Runs a command and collects its output. */
async function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...options.env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * Dumps the database.
 *
 * The dump is written as a plain SQL script so it can be read, inspected and
 * restored with `psql` without any proprietary format.
 */
async function dumpDatabase(target: string): Promise<void> {
  const url = new URL(env.DATABASE_URL);
  const args = [
    "--host", url.hostname,
    "--port", url.port || "5432",
    "--username", decodeURIComponent(url.username),
    "--dbname", url.pathname.replace(/^\//, ""),
    "--no-owner",
    "--no-privileges",
    "--format", "plain",
    "--file", target,
  ];
  const password = decodeURIComponent(url.password);
  const containerFile = `${CONTAINER_BACKUP_DIR}/${path.basename(target)}`;
  const result = await runPgTool("pg_dump", args, {
    env: password ? { PGPASSWORD: password } : undefined,
    containerPaths: { [target]: containerFile },
  });
  if (result.code !== 0) {
    throw new Error(`pg_dump failed with code ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  // When the dump ran inside the container, the file has to come back to the
  // host before it can be checksummed or restored.
  await copyOutOfContainer(target);
}

/**
 * Copies the asset tree into the backup directory.
 *
 * Returns the file count and the total bytes, or null when the deployment
 * stores assets outside the filesystem.
 */
async function copyAssets(target: string): Promise<{ files: number; bytes: number } | null> {
  const storageDir = env.STORAGE_DIR ? path.resolve(env.STORAGE_DIR) : null;
  if (!storageDir) return null;

  const info = await stat(storageDir).catch(() => null);
  if (!info?.isDirectory()) return null;

  await mkdir(target, { recursive: true });
  let files = 0;
  let bytes = 0;

  const walk = async (dir: string, relative: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const from = path.join(dir, entry.name);
      const to = path.join(target, relative, entry.name);
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true });
        await walk(from, path.join(relative, entry.name));
      } else if (entry.isFile()) {
        await mkdir(path.dirname(to), { recursive: true });
        const body = await readFile(from);
        await writeFile(to, body);
        files += 1;
        bytes += body.length;
      }
    }
  };

  await walk(storageDir, "");
  return { files, bytes };
}

/** The counts that prove the backup holds something. */
async function captureCounts() {
  const [users, books, chapters, exports, sources, sourceVersions, payments, jobs] = await Promise.all([
    prisma.user.count(),
    prisma.book.count(),
    prisma.chapter.count(),
    prisma.export.count(),
    prisma.researchSource.count(),
    prisma.sourceVersion.count(),
    prisma.payment.count(),
    prisma.generationJob.count(),
  ]);
  return { users, books, chapters, exports, sources, sourceVersions, payments, jobs };
}

/**
 * Takes a backup.
 *
 * The manifest records the checksum of every artefact and the counts that
 * were captured. The restore is a separate, deliberate step: nothing is
 * written back to the live database by this function.
 */
export async function createBackup(input: { name?: string; actorId?: string } = {}) {
  const name = input.name ?? `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const directory = backupDirectory(name);
  await mkdir(directory, { recursive: true });

  const databaseFile = path.join(directory, "database.sql");
  await dumpDatabase(databaseFile);

  const assetsDirectory = path.join(directory, "assets");
  const assetCounts = await copyAssets(assetsDirectory);

  const databaseSha256 = await sha256File(databaseFile);
  const assetsSha256 = assetCounts ? await sha256Directory(assetsDirectory) : null;

  const databaseBytes = (await stat(databaseFile)).size;
  const assetBytes = assetCounts?.bytes ?? 0;
  const counts = { ...(await captureCounts()), assetFiles: assetCounts?.files ?? 0 };

  const manifest = await prisma.backupManifest.create({
    data: {
      name,
      databaseFile,
      assetsFile: assetCounts ? assetsDirectory : null,
      bytes: databaseBytes + assetBytes,
      databaseSha256,
      assetsSha256,
      encrypted: false,
      counts: counts as object,
    },
  });

  logger.info({ name, databaseSha256, counts }, "Backup taken");
  return {
    id: manifest.id,
    name: manifest.name,
    bytes: manifest.bytes,
    databaseSha256: manifest.databaseSha256,
    assetsSha256: manifest.assetsSha256,
    counts,
    assetsCaptured: Boolean(assetCounts),
    createdAt: manifest.createdAt.toISOString(),
  };
}

/** The backups that have been taken. */
export async function listBackups(limit = 50) {
  const rows = await prisma.backupManifest.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bytes: row.bytes,
    databaseSha256: row.databaseSha256,
    assetsSha256: row.assetsSha256,
    assetsCaptured: Boolean(row.assetsFile),
    counts: row.counts as Record<string, number>,
    restoredAt: row.restoredAt?.toISOString() ?? null,
    restoredInto: row.restoredInto,
    restoreVerified: row.restoreVerified,
    restoreNotes: row.restoreNotes,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** One backup, by name. */
export async function getBackup(name: string) {
  const row = await prisma.backupManifest.findUnique({ where: { name } });
  if (!row) throw notFound("Backup");
  return {
    id: row.id,
    name: row.name,
    bytes: row.bytes,
    databaseSha256: row.databaseSha256,
    assetsSha256: row.assetsSha256,
    assetsCaptured: Boolean(row.assetsFile),
    counts: row.counts as Record<string, number>,
    restoredAt: row.restoredAt?.toISOString() ?? null,
    restoredInto: row.restoredInto,
    restoreVerified: row.restoreVerified,
    restoreNotes: row.restoreNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Rehearses the restore into an isolated database.
 *
 * The rehearsal never touches the live database. It creates a separate
 * database, loads the dump into it, checks the counts against the manifest
 * and compares the dump's checksum, then reports what it found.
 *
 * The rehearsal database is dropped again unless `keepDatabase` is set, so a
 * rehearsal does not leave a copy of customer data lying around.
 */
export async function rehearseRestore(
  name: string,
  options: { keepDatabase?: boolean; targetDatabase?: string } = {},
) {
  const manifest = await prisma.backupManifest.findUnique({ where: { name } });
  if (!manifest) throw notFound("Backup");

  const databaseFile = manifest.databaseFile;
  const checksum = await sha256File(databaseFile).catch(() => null);
  if (checksum !== manifest.databaseSha256) {
    const notes = `The dump no longer matches its checksum. Expected ${manifest.databaseSha256}, found ${checksum}.`;
    await prisma.backupManifest.update({
      where: { name },
      data: { restoredAt: new Date(), restoreVerified: false, restoreNotes: notes },
    });
    throw badRequest(notes);
  }

  const url = new URL(env.DATABASE_URL);
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  const targetDatabase = options.targetDatabase ?? `${url.pathname.replace(/^\//, "")}_restore_${Date.now().toString(36)}`;

  const password = decodeURIComponent(url.password);
  const psqlEnv = password ? { PGPASSWORD: password } : undefined;

  // The rehearsal database is created and dropped through `psql`, because
  // `CREATE DATABASE` cannot run inside a transaction.
  const created = await runPgTool(
    "psql",
    ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "postgres", "-c", `CREATE DATABASE "${targetDatabase}"`],
    { env: psqlEnv },
  );
  if (created.code !== 0) {
    throw new Error(`Could not create the rehearsal database: ${created.stderr.trim()}`);
  }

  try {
    // The dump has to be readable where `psql` runs. When the tool runs inside
    // the container, the dump is copied in first.
    const containerMode = !(await commandExists("psql"));
    if (containerMode) await copyIntoContainer(databaseFile);

    const restored = await runPgTool(
      "psql",
      ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", targetDatabase, "-v", "ON_ERROR_STOP=1", "-f", databaseFile],
      { env: psqlEnv, containerPaths: { [databaseFile]: `${CONTAINER_BACKUP_DIR}/${path.basename(databaseFile)}` } },
    );
    if (restored.code !== 0) {
      throw new Error(`The restore failed: ${restored.stderr.trim() || restored.stdout.trim()}`);
    }

    // The counts in the rehearsal database are compared with the counts the
    // manifest recorded. A mismatch means the dump does not hold what the
    // manifest promised.
    //
    // The table names are the ones Prisma maps them to, which is what the
    // dump contains.
    const verify = await runPgTool(
      "psql",
      [
        "--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", targetDatabase,
        "-t", "-A", "-c",
        "SELECT (SELECT count(*) FROM \"user\") || ',' || (SELECT count(*) FROM books) || ',' || (SELECT count(*) FROM chapters) || ',' || (SELECT count(*) FROM generation_jobs)",
      ],
      { env: psqlEnv },
    );
    const parts = verify.stdout.trim().split(",").map((n) => Number(n.trim()));
    const observed = { users: parts[0], books: parts[1], chapters: parts[2], jobs: parts[3] };
    const expected = manifest.counts as Record<string, number>;
    const matches =
      observed.users === expected.users &&
      observed.books === expected.books &&
      observed.chapters === expected.chapters &&
      observed.jobs === expected.jobs;

    const notes = matches
      ? `The dump restored into ${targetDatabase} with the counts the manifest recorded.`
      : `The dump restored into ${targetDatabase} but the counts differ from the manifest. Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}.`;

    await prisma.backupManifest.update({
      where: { name },
      data: { restoredAt: new Date(), restoredInto: targetDatabase, restoreVerified: matches, restoreNotes: notes },
    });

    return { name, targetDatabase, verified: matches, observed, expected, notes, databaseSha256: checksum };
  } finally {
    if (!options.keepDatabase) {
      await runPgTool(
        "psql",
        ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "postgres", "-c", `DROP DATABASE IF EXISTS "${targetDatabase}" WITH (FORCE)`],
        { env: psqlEnv },
      ).catch((err) => logger.warn({ err }, "Could not drop the rehearsal database"));
    }
  }
}

/** Removes a backup and the files it wrote. */
export async function deleteBackup(name: string): Promise<void> {
  const manifest = await prisma.backupManifest.findUnique({ where: { name } });
  if (!manifest) throw notFound("Backup");
  await rm(backupDirectory(name), { recursive: true, force: true });
  await prisma.backupManifest.delete({ where: { name } });
}
