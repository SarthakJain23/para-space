import path from 'node:path';

/** `feat/TK-101` → `feat-TK-101` */
export function slugify(branch: string): string {
  return branch
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/** Sibling directory for a worktree: `../<repoName>-<slug>` (absolute). */
export function worktreePathFor(mainRoot: string, branch: string): string {
  const root = path.resolve(mainRoot);
  return path.resolve(path.dirname(root), `${path.basename(root)}-${slugify(branch)}`);
}
