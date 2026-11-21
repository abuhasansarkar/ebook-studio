import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The environment files the E2E stack reads.
 *
 * A byte-order mark at the start of a `.env` file is not visible in an editor
 * but it is fatal at runtime: Node's `--env-file` parser treats the BOM as part
 * of the first key's name, so the first variable in the file is silently
 * dropped. In this project that was `APP_URL`, which made the frontend serve
 * the wrong origin and the journeys fail for a reason that had nothing to do
 * with the code under test.
 *
 * The check is a plain byte test rather than a behavioural one, because the
 * failure it guards against is the file being misread before any code runs.
 */

const repoRoot = path.resolve(__dirname, "..", "..");
const envFiles = [".env", ".env.example", ".env.e2e", ".env.e2e.local"].filter((name) =>
  existsSync(path.join(repoRoot, name)),
);

describe("environment files", () => {
  it("finds the environment files to check", () => {
    expect(envFiles.length).toBeGreaterThan(0);
  });

  it.each(envFiles)("%s has no byte-order mark", (name) => {
    const bytes = readFileSync(path.join(repoRoot, name));
    const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    expect(hasBom).toBe(false);
  });

  it.each(envFiles)("%s is valid UTF-8", (name) => {
    const bytes = readFileSync(path.join(repoRoot, name));
    // Decoding and re-encoding must give back the same bytes. A file that is
    // not valid UTF-8 does not survive the round trip.
    expect(Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)).toBe(true);
  });

  it.each(envFiles)("%s has no replacement characters", (name) => {
    const text = readFileSync(path.join(repoRoot, name), "utf8");
    expect(text.includes("\uFFFD")).toBe(false);
  });

  it.each(envFiles)("%s gives every key a plain name", (name) => {
    const text = readFileSync(path.join(repoRoot, name), "utf8");
    const keys = text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => line.split("=")[0]?.trim() ?? "");
    for (const key of keys) {
      // A key carrying a BOM or any other stray character would be silently
      // ignored by the loader.
      expect(key).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    }
  });

  it("has no stray files with a byte-order mark in the workspace root", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(env|cjs|mjs|js|ts|tsx|json|md|yml|yaml)$/i.test(entry.name)) continue;
      if (entry.name.startsWith(".")) {
        const bytes = readFileSync(path.join(repoRoot, entry.name));
        if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          offenders.push(entry.name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
