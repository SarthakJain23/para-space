import path from 'node:path';
import { lstat, mkdir, readlink, rm, symlink, unlink } from 'node:fs/promises';
import { run } from './util/exec.js';
import { exists } from './util/fs.js';

export async function isSymlink(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Create an absolute symlink `linkPath` → `target`. Directories use junctions on Windows (D-009). */
export async function linkPath(target: string, linkPathAbs: string, kind: 'dir' | 'file'): Promise<void> {
  const absTarget = path.resolve(target);
  const absLink = path.resolve(linkPathAbs);
  await mkdir(path.dirname(absLink), { recursive: true });
  const type = kind === 'dir' ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file';
  await symlink(absTarget, absLink, type);
}

/** Remove a symlink without ever following it. No-op if `p` is not a symlink. */
export async function unlinkIfSymlink(p: string): Promise<boolean> {
  if (!(await isSymlink(p))) return false;
  await unlink(p);
  return true;
}

/**
 * Link `<mainRoot>/<rel>` into `<worktreeRoot>/<rel>` unless the source is missing or the
 * destination already exists. Returns the created link path, if any.
 */
export async function linkFromMain(
  mainRoot: string,
  worktreeRoot: string,
  rel: string,
  kind: 'dir' | 'file',
): Promise<string | undefined> {
  const src = path.resolve(mainRoot, rel);
  const dest = path.resolve(worktreeRoot, rel);
  if (!(await exists(src)) || (await exists(dest))) return undefined;
  await linkPath(src, dest, kind);
  return dest;
}

export async function linkTarget(p: string): Promise<string | undefined> {
  try {
    return path.resolve(path.dirname(p), await readlink(p));
  } catch {
    return undefined;
  }
}

/**
 * Copy-on-write clone of a directory (APFS `cp -c`, Linux `cp --reflink=auto`).
 * Returns false when no CoW clone is possible, so callers can fall back to a fresh install.
 */
export async function cowClone(src: string, dest: string): Promise<boolean> {
  const args =
    process.platform === 'darwin'
      ? ['-c', '-R', src, dest]
      : process.platform === 'linux'
        ? ['-R', '--reflink=auto', src, dest]
        : undefined;
  if (!args) return false;
  try {
    await run('cp', args, path.dirname(dest));
    return true;
  } catch {
    await rm(dest, { recursive: true, force: true });
    return false;
  }
}
