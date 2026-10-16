import path from 'node:path';
import { copyFile } from 'node:fs/promises';
import { linkFromMain } from '../link.js';
import { exists } from '../util/fs.js';
import { hasAny } from './shared.js';
import type { FrameworkStrategy } from './types.js';

const SHARED_ENV = '.env';
const LOCAL_ENV = '.env.local';

/**
 * `.env` is symlinked so secret edits are shared; `.env.local` is copied so each
 * worktree can carry its own port assignment (D-013).
 */
export const envStrategy: FrameworkStrategy = {
  name: 'EnvStrategy',
  kind: 'config',
  sharedPaths: [SHARED_ENV],

  detect: (root) => hasAny(root, [SHARED_ENV, LOCAL_ENV]),

  async linkDependencies(mainRoot, worktreeRoot) {
    const link = await linkFromMain(mainRoot, worktreeRoot, SHARED_ENV, 'file');
    const src = path.resolve(mainRoot, LOCAL_ENV);
    const dest = path.resolve(worktreeRoot, LOCAL_ENV);
    if ((await exists(src)) && !(await exists(dest))) await copyFile(src, dest);
    return link ? [link] : [];
  },

  // Env files are config, not dependencies — nothing to break away from.
  isolateDependencies: async () => false,
};
