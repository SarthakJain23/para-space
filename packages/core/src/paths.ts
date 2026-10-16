import path from 'node:path';

/**
 * Turns a branch name into a safe directory-name fragment.
 *
 * @example
 * slugify('feat/TK-101'); // → 'feat-TK-101'
 * slugify('fix//weird name!'); // → 'fix-weird-name'
 */
export function slugify(branch: string): string {
  return branch
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * Absolute sibling directory for a branch's worktree: `../<repoName>-<slug>` (D-012).
 *
 * @example
 * worktreePathFor('/code/myapp', 'feat/TK-101'); // → '/code/myapp-feat-TK-101'
 */
export function worktreePathFor(mainRoot: string, branch: string): string {
  const root = path.resolve(mainRoot);
  return path.resolve(path.dirname(root), `${path.basename(root)}-${slugify(branch)}`);
}
