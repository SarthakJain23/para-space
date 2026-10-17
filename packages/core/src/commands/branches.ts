import * as git from '../git.js';
import type { CommonOptions } from './types.js';

/**
 * Local branches of the repo, most recently committed first. Front ends use it to offer a base
 * branch for `createWorktree` or to tell whether a branch already exists.
 *
 * @param opts - `cwd`: any directory inside the repo or one of its worktrees.
 * @returns Short branch names, e.g. `['feat/TK-101', 'main']`.
 *
 * @example
 * const [latest] = await listBranches({ cwd: '/code/app' }); // → 'feat/TK-101'
 */
export async function listBranches(opts: CommonOptions): Promise<string[]> {
  return git.localBranches(await git.mainRepoRoot(opts.cwd));
}
