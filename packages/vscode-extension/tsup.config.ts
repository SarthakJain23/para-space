import { defineConfig } from 'tsup';

// VS Code loads extensions with require(): ship one CommonJS file with core bundled in (D-030).
export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  noExternal: ['@para-space/core'],
  sourcemap: true,
  clean: true,
});
