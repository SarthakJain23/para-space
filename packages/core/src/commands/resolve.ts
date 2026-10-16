import path from 'node:path';
import * as git from '../git.js';
import { type WorktreeRecord, getRepoState } from '../state.js';

export interface ResolvedWorktree {
  mainRoot: string;
  wtPath: string;
  branch?: string;
  record?: WorktreeRecord;
}

/** Find a linked worktree by branch name, directory name or path. */
export async function resolveWorktree(cwd: string, target: string): Promise<ResolvedWorktree> {
  const mainRoot = await git.mainRepoRoot(cwd);
  const abs = path.resolve(cwd, target);
  const tree = (await git.worktreeList(mainRoot)).find(
    (t) => t.branch === target || path.resolve(t.path) === abs || path.basename(t.path) === target,
  );
  if (!tree) throw new Error(`No worktree matches "${target}" (use a branch name, directory name or path).`);
  const wtPath = path.resolve(tree.path);
  if (wtPath === mainRoot) throw new Error('That is the main repository, not a ParaSpace worktree.');
  const record = (await getRepoState(mainRoot)).worktrees.find((w) => w.path === wtPath);
  return { mainRoot, wtPath, branch: tree.branch, record };
}

/** Display name for a worktree in messages and ledger titles. */
export const labelOf = (w: Pick<ResolvedWorktree, 'branch' | 'wtPath'>): string => w.branch ?? path.basename(w.wtPath);
