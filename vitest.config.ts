import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test front ends against core's source, so `pnpm test` never depends on a stale core build.
  resolve: {
    alias: { '@para-space/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
