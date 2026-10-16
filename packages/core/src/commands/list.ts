import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { sharedPaths } from '../frameworks/index.js';
import * as git from '../git.js';
import { mainRepoPort } from '../ports/index.js';
import { type DepsMode, updateRepoState } from '../state.js';
import type { CommonOptions } from './types.js';

export interface WorktreeInfo {
  name: string;
  path: string;
  branch?: string;
  isMain: boolean;
  dirty: number;
  port?: number;
  depsMode: DepsMode;
  color?: string;
  managed: boolean;
}

/** Source (main) · Symlinked (any dep dir is a link) · Isolated (real dep dirs) · None. */
async function depsModeOf(wtPath: string, isMain: boolean): Promise<DepsMode> {
  let found = false;
  for (const rel of sharedPaths('dependencies')) {
    const st = await lstat(path.join(wtPath, rel)).catch(() => undefined);
    if (!st) continue;
    if (isMain) return 'Source';
    if (st.isSymbolicLink()) return 'Symlinked';
    found = true;
  }
  return found ? 'Isolated' : 'None';
}

/**
 * Lists the main repo and every worktree with branch, dirty count, port and dependency mode.
 *
 * Git is the source of truth: state records whose worktree no longer exists are pruned.
 * Worktrees not created by ParaSpace are included with `managed: false`. See FLOW.md §2.
 *
 * @param opts - `cwd`: any directory inside the repo or one of its worktrees.
 * @returns One row per worktree, main repo first.
 *
 * @example
 * const rows = await listWorktrees({ cwd: '/code/app' });
 * // [{ name: '(main)', port: 3000, depsMode: 'Source', ... },
 * //  { name: 'app-feat-TK-101', port: 3001, depsMode: 'Symlinked', ... }]
 */
export async function listWorktrees(opts: CommonOptions): Promise<WorktreeInfo[]> {
  const mainRoot = await git.mainRepoRoot(opts.cwd);
  const config = await loadConfig(mainRoot);
  const trees = (await git.worktreeList(mainRoot)).filter((t) => !t.bare);
  const livePaths = new Set(trees.map((t) => path.resolve(t.path)));

  // Prune state entries whose worktree no longer exists.
  const records = await updateRepoState(mainRoot, (r) => {
    r.worktrees = r.worktrees.filter((w) => livePaths.has(w.path));
    return new Map(r.worktrees.map((w) => [w.path, w]));
  });

  return Promise.all(
    trees.map(async (t): Promise<WorktreeInfo> => {
      const p = path.resolve(t.path);
      const isMain = p === mainRoot;
      const rec = records.get(p);
      return {
        name: isMain ? '(main)' : path.basename(p),
        path: p,
        branch: t.branch ?? (t.detached ? '(detached)' : undefined),
        isMain,
        dirty: await git.dirtyCount(p).catch(() => 0),
        port: isMain ? mainRepoPort(config) : rec?.port,
        depsMode: await depsModeOf(p, isMain),
        color: rec?.color,
        managed: isMain || !!rec,
      };
    }),
  );
}
