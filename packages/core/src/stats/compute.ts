import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { listWorktrees } from '../commands/list.js';
import { sharedPaths } from '../frameworks/index.js';
import * as git from '../git.js';
import { getRepoState, readState } from '../state.js';
import { exists } from '../util/fs.js';
import { discoverWorkspaceRepoRoots } from '../workspace/discovery.js';
import { getWorkspaceRecords } from '../workspaceState.js';
import {
  emptyLifetimeCounters,
  mergeDailyActivity,
  mergeLifetimeCounters,
  missingRepoStats,
  stripDailyActivity,
  summarizeRepos,
} from './aggregate.js';
import { bootstrapRepoStatsFromHistory } from './bootstrap.js';
import { estimateTimeSavedMs, measureDirBytes, measureRepoSharedSizes } from './measure.js';
import { readStatsStore } from './store.js';
import type {
  DailyActivityBucket,
  ParaSpaceStats,
  RepoLifetimeStats,
  RepoStats,
  StatsOptions,
  WorktreeStats,
} from './types.js';

async function linkedDepRelsIn(wtPath: string): Promise<string[]> {
  const rels: string[] = [];
  for (const rel of sharedPaths('dependencies')) {
    const st = await lstat(path.join(wtPath, rel)).catch(() => undefined);
    if (st?.isSymbolicLink()) rels.push(rel);
  }
  return rels;
}

async function isolatedDepBytesIn(wtPath: string): Promise<number> {
  let total = 0;
  for (const rel of sharedPaths('dependencies')) {
    const full = path.join(wtPath, rel);
    const st = await lstat(full).catch(() => undefined);
    if (st && !st.isSymbolicLink()) total += await measureDirBytes(full);
  }
  return total;
}

async function resolveTargetRepoRoots(opts: StatsOptions, knownStoreRoots: string[]): Promise<string[]> {
  const scope = opts.scope ?? 'repo';
  if (scope === 'global') {
    const state = await readState();
    const roots = new Set<string>([
      ...Object.keys(state.repos).map((r) => path.resolve(r)),
      ...knownStoreRoots.map((r) => path.resolve(r)),
    ]);
    const current = await git.mainRepoRoot(opts.cwd).catch(() => undefined);
    if (current) roots.add(path.resolve(current));
    else {
      for (const r of await discoverWorkspaceRepoRoots(opts.cwd).catch(() => [])) roots.add(path.resolve(r));
    }
    return [...roots].sort();
  }

  if (opts.repoRoots && opts.repoRoots.length > 0) {
    return [...new Set(opts.repoRoots.map((r) => path.resolve(r)))];
  }
  const current = await git.mainRepoRoot(opts.cwd).catch(() => undefined);
  if (current) return [path.resolve(current)];
  return await discoverWorkspaceRepoRoots(opts.cwd).catch(() => []);
}

async function computeRepoStats(
  mainRoot: string,
  persisted: RepoLifetimeStats | undefined,
  includeDiskUsage: boolean,
  log: StatsOptions['log'],
): Promise<{ repo: RepoStats; daily: DailyActivityBucket[] }> {
  if (!(await exists(mainRoot))) return missingRepoStats(mainRoot, persisted);

  const [rows, repoState, sharedSizes] = await Promise.all([
    listWorktrees({ cwd: mainRoot, log }),
    getRepoState(mainRoot),
    includeDiskUsage
      ? measureRepoSharedSizes(mainRoot)
      : Promise.resolve({ sharedDepsBytes: 0, sharedDepsByRel: new Map<string, number>(), sharedGitBytes: 0 }),
  ]);

  const recordsByPath = new Map(repoState.worktrees.map((w) => [path.resolve(w.path), w]));
  const now = Date.now();
  let liveDiskSavedBytes = 0;
  let liveTimeSavedMs = 0;
  let totalDiskUsageBytes = 0;
  let totalIsolatedDepsBytes = 0;

  const worktrees: WorktreeStats[] = await Promise.all(
    rows.map(async (row) => {
      const rec = recordsByPath.get(path.resolve(row.path));
      const createdAt = rec?.createdAt;
      const ageMs = createdAt ? Math.max(0, now - new Date(createdAt).getTime()) : undefined;
      const linkedRels = row.isMain ? [] : await linkedDepRelsIn(row.path);

      const diskUsageBytes = includeDiskUsage ? await measureDirBytes(row.path) : 0;
      const isolatedDepsBytes =
        includeDiskUsage && !row.isMain && row.depsMode === 'Isolated' ? await isolatedDepBytesIn(row.path) : 0;

      let linkedDepsSaved = 0;
      for (const rel of linkedRels) linkedDepsSaved += sharedSizes.sharedDepsByRel.get(rel) ?? 0;

      const diskSavedBytes = row.isMain ? 0 : linkedDepsSaved + sharedSizes.sharedGitBytes;
      const timeSavedMs = row.isMain
        ? 0
        : estimateTimeSavedMs({
            linkedDepRels: linkedRels,
            linkedDepsBytes: linkedDepsSaved,
            sharedGitBytes: sharedSizes.sharedGitBytes,
          });

      totalDiskUsageBytes += diskUsageBytes;
      totalIsolatedDepsBytes += isolatedDepsBytes;
      liveDiskSavedBytes += diskSavedBytes;
      liveTimeSavedMs += timeSavedMs;

      return {
        name: row.name,
        path: row.path,
        branch: row.branch,
        isMain: row.isMain,
        managed: row.managed,
        depsMode: row.depsMode,
        dirty: row.dirty,
        diverged: Boolean(row.diverged),
        port: row.port,
        color: row.color,
        createdAt,
        ageMs,
        diskUsageBytes,
        isolatedDepsBytes,
        diskSavedBytes,
      };
    }),
  );

  const linked = worktrees.filter((w) => !w.isMain);
  const perWtDiskSaved = sharedSizes.sharedDepsBytes + sharedSizes.sharedGitBytes;
  const perWtTimeSaved = estimateTimeSavedMs({
    linkedDepRels: [...sharedSizes.sharedDepsByRel.keys()],
    linkedDepsBytes: sharedSizes.sharedDepsBytes,
    sharedGitBytes: sharedSizes.sharedGitBytes,
  });

  const life =
    persisted ?? (await bootstrapRepoStatsFromHistory(mainRoot, linked.length, perWtDiskSaved, perWtTimeSaved));
  const lifetime = stripDailyActivity(life);
  lifetime.peakConcurrentWorktrees = Math.max(lifetime.peakConcurrentWorktrees, linked.length);

  return {
    repo: {
      mainRoot,
      name: path.basename(mainRoot),
      missing: false,
      activeWorktrees: worktrees.length,
      linkedWorktrees: linked.length,
      managedWorktrees: worktrees.filter((w) => w.managed).length,
      symlinkedCount: linked.filter((w) => w.depsMode === 'Symlinked').length,
      isolatedCount: linked.filter((w) => w.depsMode === 'Isolated').length,
      dirtyCount: worktrees.filter((w) => w.dirty > 0).length,
      divergedCount: linked.filter((w) => w.diverged).length,
      portsAllocated: worktrees.map((w) => w.port).filter((p): p is number => p !== undefined),
      sharedDepsSizeBytes: sharedSizes.sharedDepsBytes,
      sharedGitSizeBytes: sharedSizes.sharedGitBytes,
      totalDiskUsageBytes,
      isolatedDepsBytes: totalIsolatedDepsBytes,
      liveDiskSavedBytes,
      liveTimeSavedMs,
      lifetime,
      worktrees,
    },
    daily: life.dailyActivity,
  };
}

/**
 * Computes live and persistent lifetime statistics for ParaSpace worktrees and multi-repo workspaces.
 *
 * Scopes to the current repository/workspace by default (`scope: 'repo'`), or aggregates across every
 * tracked repository on the machine when `scope: 'global'`. Reuses `listWorktrees` and `getWorkspaceRecords`
 * so git state and workspace metadata stay consistent across all surfaces (D-055).
 *
 * @param opts - `cwd`, optional `scope` (`'repo' | 'global'`), `includeDiskUsage` (default `true`), and `repoRoots`.
 * @returns Full `ParaSpaceStats` report including summary KPIs, lifetime counters, daily activity, per-repo and per-worktree details.
 *
 * @example
 * const stats = await getStats({ cwd: '/code/app' });
 */
export async function getStats(opts: StatsOptions): Promise<ParaSpaceStats> {
  const scope = opts.scope ?? 'repo';
  const includeDiskUsage = opts.includeDiskUsage ?? true;
  const store = await readStatsStore();
  const repoRoots = await resolveTargetRepoRoots(opts, Object.keys(store.repos));

  const computed = await Promise.all(
    repoRoots.map((root) => computeRepoStats(root, store.repos[root], includeDiskUsage, opts.log)),
  );
  const repos = computed.map((c) => c.repo);
  const workspacesRaw = await getWorkspaceRecords(scope === 'global' ? undefined : repoRoots).catch(() => []);

  return {
    scope,
    generatedAt: new Date().toISOString(),
    diskMeasured: includeDiskUsage,
    summary: summarizeRepos(repos, workspacesRaw.length),
    lifetime: repos.length > 0 ? mergeLifetimeCounters(repos.map((r) => r.lifetime)) : emptyLifetimeCounters(),
    activitySeries: mergeDailyActivity(computed.map((c) => c.daily)),
    repos,
    workspaces: {
      totalWorkspaces: workspacesRaw.length,
      workspaces: workspacesRaw.map((w) => ({
        name: w.name,
        branch: w.branch,
        workspaceFile: w.workspaceFile,
        repoCount: w.repos.length,
        color: w.color,
      })),
    },
  };
}
