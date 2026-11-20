import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "../.env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Placeholder lets `prisma generate` run in Docker builds without a DB.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
