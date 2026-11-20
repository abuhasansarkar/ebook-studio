import { defineConfig } from 'vitest/config';

/**
 * Runs only the deterministic, database-free checks.
 * Used to verify pure rule logic without PostgreSQL/Redis; not part of the normal suite.
 */
export default defineConfig({
  test: {
    include: ['tests/pure-*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
