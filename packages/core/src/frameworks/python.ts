import path from 'node:path';
import { unlinkIfSymlink } from '../link.js';
import { run } from '../util/exec.js';
import { exists } from '../util/fs.js';
import { hasAny, linkDependencyDir } from './shared.js';
import type { FrameworkStrategy } from './types.js';

const VENV = '.venv';

function venvPython(venvDir: string): string {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

export const pythonStrategy: FrameworkStrategy = {
  name: 'PythonStrategy',
  kind: 'dependencies',
  sharedPaths: [VENV],

  detect: (root) => hasAny(root, ['pyproject.toml', 'requirements.txt', VENV]),

  linkDependencies: (mainRoot, worktreeRoot, log) =>
    linkDependencyDir(mainRoot, worktreeRoot, VENV, log, 'create one there first to share it.'),

  /**
   * Virtualenvs hard-code their own absolute path in scripts, so a copy would still point
   * at the main repo. Always build a fresh venv instead (D-017).
   */
  async isolateDependencies(worktreeRoot, _mainRoot, log) {
    const venv = path.resolve(worktreeRoot, VENV);
    if (!(await unlinkIfSymlink(venv))) return false;
    log.info('Creating a fresh .venv in the worktree…');
    await run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', venv], worktreeRoot);
    const installArgs = (await exists(path.join(worktreeRoot, 'requirements.txt')))
      ? ['-r', 'requirements.txt']
      : (await exists(path.join(worktreeRoot, 'pyproject.toml')))
        ? ['-e', '.']
        : undefined;
    if (installArgs) await run(venvPython(venv), ['-m', 'pip', 'install', ...installArgs], worktreeRoot);
    return true;
  },

  /** Points at the worktree's own `.venv` path, so it stays correct after isolation (D-021). */
  async configureIdeSettings(_mainRoot, worktreeRoot) {
    return { 'python.defaultInterpreterPath': venvPython(path.resolve(worktreeRoot, VENV)) };
  },
};
