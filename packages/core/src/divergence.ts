import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectStrategies } from './frameworks/index.js';

export interface DivergenceResult {
  worktreePath: string;
  diverged: boolean;
  divergedFiles: string[];
  strategies: string[];
}

/**
 * Checks whether a worktree's dependency manifests have diverged from the main repository (D-003).
 *
 * For each detected dependency strategy (e.g. Node, Python), compares manifest and lockfile
 * contents between `mainRoot` and `worktreeRoot`. If any manifest exists in one and not the
 * other, or has differing contents, it is marked as diverged.
 *
 * @param mainRoot - Absolute path to the main repository.
 * @param worktreeRoot - Absolute path to the worktree to check.
 * @returns Result describing whether dependencies diverged and which files/strategies differ.
 *
 * @example
 * const res = await checkDivergence('/code/app', '/code/app-feat-x');
 * if (res.diverged) console.log('Diverged files:', res.divergedFiles);
 */
export async function checkDivergence(mainRoot: string, worktreeRoot: string): Promise<DivergenceResult> {
  const absMain = path.resolve(mainRoot);
  const absWt = path.resolve(worktreeRoot);
  if (absMain === absWt) {
    return { worktreePath: absWt, diverged: false, divergedFiles: [], strategies: [] };
  }

  const strategies = (await detectStrategies(absMain)).filter((s) => s.kind === 'dependencies');
  const divergedFiles: string[] = [];
  const affectedStrategies = new Set<string>();

  for (const s of strategies) {
    for (const file of s.manifestFiles ?? []) {
      const mainFile = path.join(absMain, file);
      const wtFile = path.join(absWt, file);

      const [mainContent, wtContent] = await Promise.all([
        readFile(mainFile).catch(() => undefined),
        readFile(wtFile).catch(() => undefined),
      ]);

      if (mainContent === undefined && wtContent === undefined) continue;

      if (mainContent === undefined || wtContent === undefined || !mainContent.equals(wtContent)) {
        if (!divergedFiles.includes(file)) divergedFiles.push(file);
        affectedStrategies.add(s.name);
      }
    }
  }

  return {
    worktreePath: absWt,
    diverged: divergedFiles.length > 0,
    divergedFiles,
    strategies: [...affectedStrategies],
  };
}

/**
 * Checks divergence for multiple worktrees against the main repository.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @param worktreePaths - Array of worktree paths to check.
 * @returns Map of worktree path to DivergenceResult.
 *
 * @example
 * const results = await checkAllDivergence('/code/app', ['/code/app-feat-1', '/code/app-feat-2']);
 */
export async function checkAllDivergence(
  mainRoot: string,
  worktreePaths: string[],
): Promise<Map<string, DivergenceResult>> {
  const map = new Map<string, DivergenceResult>();
  await Promise.all(
    worktreePaths.map(async (wtPath) => {
      const res = await checkDivergence(mainRoot, wtPath);
      map.set(wtPath, res);
    }),
  );
  return map;
}
