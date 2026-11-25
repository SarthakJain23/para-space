import path from 'node:path';
import type { DailyActivityBucket, LifetimeCounters, RepoLifetimeStats, RepoStats, StatsSummary } from './types.js';

export const MAX_ACTIVITY_DAYS = 90;

/**
 * Creates a zeroed `LifetimeCounters` object.
 *
 * @returns Empty lifetime counters.
 * @example
 * const counters = emptyLifetimeCounters();
 */
export function emptyLifetimeCounters(): LifetimeCounters {
  return {
    createdCount: 0,
    isolatedCount: 0,
    removedCount: 0,
    peakConcurrentWorktrees: 0,
    cumulativeDiskSavedBytes: 0,
    cumulativeTimeSavedMs: 0,
  };
}

/**
 * Creates a zeroed `RepoLifetimeStats` entry with no daily buckets.
 *
 * @returns Empty repo lifetime stats.
 * @example
 * const stats = emptyRepoLifetimeStats();
 */
export function emptyRepoLifetimeStats(): RepoLifetimeStats {
  return { ...emptyLifetimeCounters(), dailyActivity: [] };
}

/**
 * Converts a `Date` to a UTC `YYYY-MM-DD` bucket key.
 *
 * @param date - Date to convert.
 * @returns ISO calendar date key.
 * @example
 * toDateKey(new Date('2026-11-25T10:00:00Z')); // → '2026-11-25'
 */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Updates or inserts a daily activity bucket and trims the series to the most recent 90 days.
 *
 * @param buckets - Existing bucket list (mutated in place and sorted).
 * @param dateKey - Calendar date (`YYYY-MM-DD`).
 * @param delta - Incremental counts/savings to apply.
 * @returns Trimmed, sorted bucket array.
 * @example
 * upsertDailyBucket([], '2026-11-25', { created: 1 });
 */
export function upsertDailyBucket(
  buckets: DailyActivityBucket[],
  dateKey: string,
  delta: Partial<Omit<DailyActivityBucket, 'date'>>,
): DailyActivityBucket[] {
  const existing = buckets.find((b) => b.date === dateKey);
  if (existing) {
    existing.created += delta.created ?? 0;
    existing.isolated += delta.isolated ?? 0;
    existing.removed += delta.removed ?? 0;
    existing.diskSavedBytes += delta.diskSavedBytes ?? 0;
    existing.timeSavedMs += delta.timeSavedMs ?? 0;
  } else {
    buckets.push({
      date: dateKey,
      created: delta.created ?? 0,
      isolated: delta.isolated ?? 0,
      removed: delta.removed ?? 0,
      diskSavedBytes: delta.diskSavedBytes ?? 0,
      timeSavedMs: delta.timeSavedMs ?? 0,
    });
  }
  buckets.sort((a, b) => a.date.localeCompare(b.date));
  return buckets.length > MAX_ACTIVITY_DAYS ? buckets.slice(-MAX_ACTIVITY_DAYS) : buckets;
}

/** Updates `firstActivityAt` / `lastActivityAt` bounds on a lifetime stats record. */
export function touchActivityWindow(repo: LifetimeCounters, iso: string): void {
  if (!repo.firstActivityAt || iso < repo.firstActivityAt) repo.firstActivityAt = iso;
  if (!repo.lastActivityAt || iso > repo.lastActivityAt) repo.lastActivityAt = iso;
}

/** Copies counter fields without the `dailyActivity` array. */
export function stripDailyActivity(stats: RepoLifetimeStats): LifetimeCounters {
  return {
    createdCount: stats.createdCount,
    isolatedCount: stats.isolatedCount,
    removedCount: stats.removedCount,
    peakConcurrentWorktrees: stats.peakConcurrentWorktrees,
    cumulativeDiskSavedBytes: stats.cumulativeDiskSavedBytes,
    cumulativeTimeSavedMs: stats.cumulativeTimeSavedMs,
    ...(stats.firstActivityAt ? { firstActivityAt: stats.firstActivityAt } : {}),
    ...(stats.lastActivityAt ? { lastActivityAt: stats.lastActivityAt } : {}),
  };
}

/**
 * Aggregates multiple `LifetimeCounters` records into one combined summary.
 *
 * @param list - Array of per-repo lifetime counters.
 * @returns Combined `LifetimeCounters`.
 * @example
 * const total = mergeLifetimeCounters([repoA.lifetime, repoB.lifetime]);
 */
export function mergeLifetimeCounters(list: LifetimeCounters[]): LifetimeCounters {
  const out = emptyLifetimeCounters();
  for (const item of list) {
    out.createdCount += item.createdCount;
    out.isolatedCount += item.isolatedCount;
    out.removedCount += item.removedCount;
    out.peakConcurrentWorktrees = Math.max(out.peakConcurrentWorktrees, item.peakConcurrentWorktrees);
    out.cumulativeDiskSavedBytes += item.cumulativeDiskSavedBytes;
    out.cumulativeTimeSavedMs += item.cumulativeTimeSavedMs;
    if (item.firstActivityAt && (!out.firstActivityAt || item.firstActivityAt < out.firstActivityAt)) {
      out.firstActivityAt = item.firstActivityAt;
    }
    if (item.lastActivityAt && (!out.lastActivityAt || item.lastActivityAt > out.lastActivityAt)) {
      out.lastActivityAt = item.lastActivityAt;
    }
  }
  return out;
}

/**
 * Merges daily activity bucket lists across repositories into one sorted series capped at 90 days.
 *
 * @param seriesList - Per-repository daily activity bucket arrays.
 * @returns Sorted merged `DailyActivityBucket[]`.
 * @example
 * const merged = mergeDailyActivity([repoADaily, repoBDaily]);
 */
export function mergeDailyActivity(seriesList: DailyActivityBucket[][]): DailyActivityBucket[] {
  const byDate = new Map<string, DailyActivityBucket>();
  for (const series of seriesList) {
    for (const b of series) {
      const existing = byDate.get(b.date);
      if (existing) {
        existing.created += b.created;
        existing.isolated += b.isolated;
        existing.removed += b.removed;
        existing.diskSavedBytes += b.diskSavedBytes;
        existing.timeSavedMs += b.timeSavedMs;
      } else {
        byDate.set(b.date, { ...b });
      }
    }
  }
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return merged.length > MAX_ACTIVITY_DAYS ? merged.slice(-MAX_ACTIVITY_DAYS) : merged;
}

/** Builds a placeholder `RepoStats` entry for a tracked repo missing from disk. */
export function missingRepoStats(
  mainRoot: string,
  persisted?: RepoLifetimeStats,
): { repo: RepoStats; daily: DailyActivityBucket[] } {
  const life = persisted ?? emptyRepoLifetimeStats();
  return {
    repo: {
      mainRoot,
      name: path.basename(mainRoot),
      missing: true,
      activeWorktrees: 0,
      linkedWorktrees: 0,
      managedWorktrees: 0,
      symlinkedCount: 0,
      isolatedCount: 0,
      dirtyCount: 0,
      divergedCount: 0,
      portsAllocated: [],
      sharedDepsSizeBytes: 0,
      sharedGitSizeBytes: 0,
      totalDiskUsageBytes: 0,
      isolatedDepsBytes: 0,
      liveDiskSavedBytes: 0,
      liveTimeSavedMs: 0,
      lifetime: stripDailyActivity(life),
      worktrees: [],
    },
    daily: life.dailyActivity,
  };
}

/**
 * Rolls up per-repo statistics and workspace count into a top-level `StatsSummary`.
 *
 * @param repos - Computed per-repository stats.
 * @param totalWorkspaces - Number of active multi-repo workspaces in scope.
 * @returns Aggregated `StatsSummary`.
 * @example
 * const summary = summarizeRepos(repos, 1);
 */
export function summarizeRepos(repos: RepoStats[], totalWorkspaces: number): StatsSummary {
  const sum = (pick: (r: RepoStats) => number) => repos.reduce((acc, r) => acc + pick(r), 0);
  return {
    totalRepos: repos.length,
    activeRepos: repos.filter((r) => !r.missing).length,
    activeWorktrees: sum((r) => r.activeWorktrees),
    linkedWorktrees: sum((r) => r.linkedWorktrees),
    managedWorktrees: sum((r) => r.managedWorktrees),
    symlinkedCount: sum((r) => r.symlinkedCount),
    isolatedCount: sum((r) => r.isolatedCount),
    dirtyCount: sum((r) => r.dirtyCount),
    divergedCount: sum((r) => r.divergedCount),
    portsAllocated: sum((r) => r.portsAllocated.length),
    totalWorkspaces,
    totalDiskUsageBytes: sum((r) => r.totalDiskUsageBytes),
    isolatedDepsBytes: sum((r) => r.isolatedDepsBytes),
    liveDiskSavedBytes: sum((r) => r.liveDiskSavedBytes),
    liveTimeSavedMs: sum((r) => r.liveTimeSavedMs),
  };
}
