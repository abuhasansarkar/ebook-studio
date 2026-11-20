import { execSync } from "node:child_process";
import pg from "pg";

/** Creates the test database (if needed) and applies migrations. */
export default async function setup() {
  const { config } = await import("dotenv");
  const base = config({ path: "../.env", quiet: true }).parsed ?? {};
  const url = new URL(process.env.TEST_DATABASE_URL ?? (base.DATABASE_URL ?? "postgresql://ebook:ebook@localhost:5432/ebook_studio").replace(/\/[^/?]+(\?|$)/, "/ebook_studio_test$1"));
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  execSync("pnpm exec prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url.toString() } });
}
