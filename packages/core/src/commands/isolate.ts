import { detectStrategies } from '../frameworks/index.js';
import { appendLedger } from '../ledger.js';
import { isSymlink } from '../link.js';
import { silentLogger } from '../prompts.js';
import { updateRepoState } from '../state.js';
import { codeList } from '../util/format.js';
import { labelOf, resolveWorktree } from './resolve.js';
import type { CommonOptions } from './types.js';

export interface IsolateOptions extends CommonOptions {
  /** Branch name, directory name or path. */
  target: string;
  /** Why — recorded in the ledger. */
  reason?: string;
}

export interface IsolateResult {
  path: string;
  isolated: string[];
}

/**
 * Gives a worktree its own dependencies instead of the ones shared with the main repo.
 *
 * Use it before installing or upgrading packages in a worktree, so the main repo is untouched.
 * Node: copy-on-write clone of `node_modules`, else a fresh install. Python: fresh venv.
 * `.env` stays shared (D-003, D-017). See FLOW.md §3.
 *
 * @param opts - `cwd`, `target` (branch, directory name or path) and optional `reason` for the ledger.
 * @returns Names of the strategies that were isolated; empty if nothing was symlinked.
 * @throws If `target` matches no worktree, or is the main repo.
 *
 * @example
 * await isolateWorktree({ cwd: '/code/app', target: 'feat/TK-101', reason: 'Testing React 19' });
 * // → { path: '/code/app-feat-TK-101', isolated: ['NodeStrategy'] }
 */
export async function isolateWorktree(opts: IsolateOptions): Promise<IsolateResult> {
  const log = opts.log ?? silentLogger;
  const wt = await resolveWorktree(opts.cwd, opts.target);
  const { mainRoot, wtPath } = wt;

  const isolated: string[] = [];
  for (const s of await detectStrategies(mainRoot)) {
    if (await s.isolateDependencies(wtPath, mainRoot, log)) isolated.push(s.name);
  }
  if (!isolated.length) {
    log.info('Nothing to isolate — dependencies are not symlinked.');
    return { path: wtPath, isolated };
  }

  const remainingLinks: string[] = [];
  for (const l of wt.record?.links ?? []) if (await isSymlink(l)) remainingLinks.push(l);
  await updateRepoState(mainRoot, (r) => {
    const rec = r.worktrees.find((w) => w.path === wtPath);
    if (rec) Object.assign(rec, { isolated: true, links: remainingLinks });
  });

  await appendLedger(mainRoot, {
    title: `Dependencies Isolated: ${labelOf(wt)}`,
    requirement: opts.reason ?? 'Worktree dependencies diverged from the main repository.',
    decisions: [`Replaced shared dependency links with an independent copy for ${codeList(isolated)}.`],
    problemSolved: "Installing packages in this worktree can no longer alter the main repo's environment.",
  });
  return { path: wtPath, isolated };
}
