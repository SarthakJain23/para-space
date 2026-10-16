import path from 'node:path';
import { linkFromMain } from '../link.js';
import type { Logger } from '../prompts.js';
import { exists } from '../util/fs.js';

/** Link one dependency directory from main, warning when main has nothing to share yet. */
export async function linkDependencyDir(
  mainRoot: string,
  worktreeRoot: string,
  rel: string,
  log: Logger,
  missingHint: string,
): Promise<string[]> {
  if (!(await exists(path.join(mainRoot, rel)))) {
    log.warn(`Main repo has no ${rel} — ${missingHint}`);
    return [];
  }
  const link = await linkFromMain(mainRoot, worktreeRoot, rel, 'dir');
  return link ? [link] : [];
}

/** True if any of `files` exists directly under `root`. */
export async function hasAny(root: string, files: string[]): Promise<boolean> {
  for (const f of files) if (await exists(path.join(root, f))) return true;
  return false;
}
