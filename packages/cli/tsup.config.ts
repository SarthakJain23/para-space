import { defineConfig } from 'tsup';

// Bundle @para-space/core into the CLI so @para-space/cli ships as a single self-contained npm package (D-045).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  noExternal: ['@para-space/core'],
  clean: true,
});
