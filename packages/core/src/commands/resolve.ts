import path from 'node:path';
import * as git from '../git.js';
import { type WorktreeRecord, getRepoState, readState } from '../state.js';
import { discoverWorkspaceRepoRoots } from '../workspace.js';

export interface ResolvedWorktree {
  mainRoot: string;
  wtPath: string;
  branch?: string;
  record?: WorktreeRecord;
}

async function tryMainRepoRoot(dir: string): Promise<string | undefined> {
  try {
    return await git.mainRepoRoot(dir);
  } catch {
    return undefined;
  }
}

async function findInRepo(mainRoot: string, abs: string, target: string): Promise<ResolvedWorktree | undefined> {
  const trees = await git.worktreeList(mainRoot).catch(() => []);
  const tree = trees.find(
    (t) => t.branch === target || path.resolve(t.path) === abs || path.basename(t.path) === target,
  );
  if (!tree) return undefined;
  const wtPath = path.resolve(tree.path);
  if (wtPath === mainRoot) throw new Error('That is the main repository, not a ParaSpace worktree.');
  const record = (await getRepoState(mainRoot)).worktrees.find((w) => path.resolve(w.path) === wtPath);
  return { mainRoot, wtPath, branch: tree.branch, record };
}

/** Find a linked worktree by branch name, directory name or path across the active or multi-repo workspace. */
export async function resolveWorktree(cwd: string, target: string): Promise<ResolvedWorktree> {
  const abs = path.resolve(cwd, target);
  const checked = new Set<string>();
  const tryRoot = async (root?: string): Promise<ResolvedWorktree | undefined> => {
    if (!root) return undefined;
    const resolved = path.resolve(root);
    if (checked.has(resolved)) return undefined;
    checked.add(resolved);
    return findInRepo(resolved, abs, target);
  };

  // 1. Direct match from target path (if it exists on disk) or current working directory's repo
  const direct = (await tryRoot(await tryMainRepoRoot(abs))) ?? (await tryRoot(await tryMainRepoRoot(cwd)));
  if (direct) return direct;

  // 2. Multi-repo workspace / container folder fallback
  const discovered = [
    ...(await discoverWorkspaceRepoRoots(cwd)),
    ...(await discoverWorkspaceRepoRoots(path.dirname(path.resolve(cwd)))),
  ];
  for (const root of discovered) {
    const found = await tryRoot(root);
    if (found) return found;
  }

  const state = await readState();
  for (const [repoRoot, repoState] of Object.entries(state.repos)) {
    if (
      repoState.worktrees.some(
        (w) => w.branch === target || path.resolve(w.path) === abs || path.basename(w.path) === target,
      )
    ) {
      const found = await tryRoot(repoRoot);
      if (found) return found;
    }
  }

  if (checked.size === 0) {
    await git.mainRepoRoot(cwd);
  }

  throw new Error(`No worktree matches "${target}" (use a branch name, directory name or path).`);
}

/** Display name for a worktree in messages and ledger titles. */
export const labelOf = (w: Pick<ResolvedWorktree, 'branch' | 'wtPath'>): string => w.branch ?? path.basename(w.wtPath);
