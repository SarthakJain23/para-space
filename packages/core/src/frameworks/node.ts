import path from 'node:path';
import { cowClone, unlinkIfSymlink } from '../link.js';
import { run } from '../util/exec.js';
import { exists, readTextIfExists } from '../util/fs.js';
import { linkDependencyDir } from './shared.js';
import type { FrameworkStrategy } from './types.js';

const NODE_MODULES = 'node_modules';

const LOCKFILES: Array<[lockfile: string, pm: string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

export async function detectPackageManager(root: string): Promise<string> {
  for (const [lockfile, pm] of LOCKFILES) if (await exists(path.join(root, lockfile))) return pm;
  return 'npm';
}

export const nodeStrategy: FrameworkStrategy = {
  name: 'NodeStrategy',
  kind: 'dependencies',
  sharedPaths: [NODE_MODULES],
  manifestFiles: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'],

  detect: (root) => exists(path.join(root, 'package.json')),

  async linkDependencies(mainRoot, worktreeRoot, log) {
    if (await exists(path.join(mainRoot, '.pnp.cjs'))) {
      log.warn('Yarn PnP project detected (.pnp.cjs) — no node_modules to share; skipping Node linking.');
      return [];
    }
    return linkDependencyDir(mainRoot, worktreeRoot, NODE_MODULES, log, 'run an install there first to share it.');
  },

  async isolateDependencies(worktreeRoot, mainRoot, log) {
    const dest = path.resolve(worktreeRoot, NODE_MODULES);
    if (!(await unlinkIfSymlink(dest))) return false;
    if (await cowClone(path.resolve(mainRoot, NODE_MODULES), dest)) {
      log.info('node_modules cloned copy-on-write from main repo.');
      return true;
    }
    const pm = await detectPackageManager(worktreeRoot);
    log.info(`Copy-on-write clone unavailable — running ${pm} install…`);
    await run(pm, ['install'], worktreeRoot);
    return true;
  },

  async defaultEnvKeys(root) {
    const text = await readTextIfExists(path.join(root, 'package.json'));
    const pkg = text ? JSON.parse(text) : {};
    return 'vite' in { ...pkg.dependencies, ...pkg.devDependencies } ? ['VITE_PORT'] : [];
  },
};
