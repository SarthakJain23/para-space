import path from 'node:path';
import { sharedPaths } from '../frameworks/index.js';
import * as git from '../git.js';
import { appendLedger } from '../ledger.js';
import { linkTarget, unlinkIfSymlink } from '../link.js';
import { silentLogger } from '../prompts.js';
import { updateRepoState } from '../state.js';
import { exists } from '../util/fs.js';
import { code } from '../util/format.js';
import { type ResolvedWorktree, labelOf, resolveWorktree } from './resolve.js';
import type { CommonOptions } from './types.js';

export interface RemoveOptions extends CommonOptions {
  /** Branch name, directory name or path. */
  target: string;
  deleteBranch?: boolean;
  /** Remove despite uncommitted changes; force-delete the branch. */
  force?: boolean;
}

export interface RemoveResult {
  path: string;
  branch?: string;
  branchDeleted: boolean;
}

/**
 * Removes a worktree and frees its port, optionally deleting its branch.
 *
 * Shared links are unlinked first, so the main repo's dependencies are never deleted through
 * them. Refuses a worktree with uncommitted changes unless `force`. See FLOW.md §4.
 *
 * @param opts - `cwd`, `target` (branch, directory name or path), `deleteBranch`, `force`.
 * @returns The removed path and whether the branch was deleted.
 * @throws If `target` matches no worktree, is the main repo, or is dirty without `force`.
 *
 * @example
 * await removeWorktree({ cwd: '/code/app', target: 'feat/TK-101', deleteBranch: true });
 */
export async function removeWorktree(opts: RemoveOptions): Promise<RemoveResult> {
  const log = opts.log ?? silentLogger;
  const wt = await resolveWorktree(opts.cwd, opts.target);
  const { mainRoot, wtPath, branch, record } = wt;

  if (await exists(wtPath)) {
    const dirty = await git.dirtyCount(wtPath).catch(() => 0);
    if (dirty && !opts.force) {
      throw new Error(`Worktree has ${dirty} uncommitted change(s). Commit/stash them or pass --force.`);
    }
    await unlinkShared(wt);
  }

  await git.worktreeRemove(mainRoot, wtPath, opts.force);
  await git.worktreePrune(mainRoot);
  const branchDeleted =
    opts.deleteBranch && branch ? await tryDeleteBranch(mainRoot, branch, opts.force, log.warn) : false;

  await updateRepoState(mainRoot, (r) => {
    r.worktrees = r.worktrees.filter((w) => w.path !== wtPath);
  });
  await appendLedger(mainRoot, {
    title: `Worktree Removed: ${labelOf(wt)}`,
    requirement: `Work on ${code(branch ?? wtPath)} finished or abandoned.`,
    decisions: [
      `Removed worktree ${code(wtPath)}${record?.port !== undefined ? ` and released port ${code(record.port)}` : ''}.`,
      branchDeleted ? `Deleted branch ${code(branch!)}.` : 'Branch kept.',
    ],
    problemSolved: 'Frees disk space and the dev port; keeps `git worktree list` tidy.',
  });
  return { path: wtPath, branch, branchDeleted };
}

/**
 * Unlink shared paths BEFORE removal so it can never follow a link into the main repo:
 * every recorded link, plus any known shared path that links into main.
 */
async function unlinkShared({ mainRoot, wtPath, record }: ResolvedWorktree): Promise<void> {
  const recorded = new Set(record?.links ?? []);
  const candidates = new Set([...recorded, ...sharedPaths().map((rel) => path.join(wtPath, rel))]);
  for (const p of candidates) {
    const target = await linkTarget(p);
    if (target && (recorded.has(p) || target.startsWith(mainRoot + path.sep))) await unlinkIfSymlink(p);
  }
}

async function tryDeleteBranch(
  mainRoot: string,
  branch: string,
  force = false,
  warn: (m: string) => void,
): Promise<boolean> {
  try {
    await git.branchDelete(mainRoot, branch, force);
    return true;
  } catch (err) {
    warn(`Branch not deleted: ${(err as Error).message}`);
    return false;
  }
}
