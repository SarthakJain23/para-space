import os from 'node:os';
import path from 'node:path';

/**
 * Root directory for all ParaSpace state, worktrees, and workspace files (`~/.para-space`),
 * overridable via `PARA_SPACE_HOME` (D-010, D-049).
 *
 * @returns Absolute path to the ParaSpace home directory.
 *
 * @example
 * const home = paraSpaceHome(); // → '/Users/you/.para-space'
 */
export function paraSpaceHome(): string {
  return path.resolve(process.env.PARA_SPACE_HOME ?? path.join(os.homedir(), '.para-space'));
}

/**
 * Centralized directory where ParaSpace creates git worktrees: `~/.para-space/worktrees` (D-049).
 *
 * @returns Absolute path to the centralized worktrees directory.
 *
 * @example
 * const dir = worktreesDir(); // → '/Users/you/.para-space/worktrees'
 */
export function worktreesDir(): string {
  return path.join(paraSpaceHome(), 'worktrees');
}

/**
 * Centralized directory where ParaSpace stores `.code-workspace` files: `~/.para-space/workspaces` (D-049).
 *
 * @returns Absolute path to the centralized workspaces directory.
 *
 * @example
 * const dir = workspacesDir(); // → '/Users/you/.para-space/workspaces'
 */
export function workspacesDir(): string {
  return path.join(paraSpaceHome(), 'workspaces');
}

/**
 * Turns a branch name into a safe directory-name fragment.
 *
 * @param branch - Raw git branch name or label.
 * @returns Filesystem-safe slug with slashes and unsafe characters replaced by `-`.
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
 * Centralized directory for a branch's worktree: `~/.para-space/worktrees/<projectSlug>/<repoName>-<slug>` (D-049).
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @param branch - Branch name for the worktree.
 * @returns Absolute path where the worktree should be created.
 *
 * @example
 * worktreePathFor('/code/myapp', 'feat/TK-101'); // → '/Users/you/.para-space/worktrees/code/myapp-feat-TK-101'
 */
export function worktreePathFor(mainRoot: string, branch: string): string {
  const root = path.resolve(mainRoot);
  const projectSlug = slugify(path.basename(path.dirname(root))) || 'default';
  return path.join(worktreesDir(), projectSlug, `${path.basename(root)}-${slugify(branch)}`);
}
