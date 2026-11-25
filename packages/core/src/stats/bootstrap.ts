import { readLedger } from '../ledger.js';
import { emptyRepoLifetimeStats, toDateKey, touchActivityWindow, upsertDailyBucket } from './aggregate.js';
import type { RepoLifetimeStats } from './types.js';

/**
 * Builds baseline lifetime stats for a repository not yet recorded in `stats.json`
 * by reading its `.para-space/context-history.md` ledger and reconciling active worktrees.
 *
 * @param mainRoot - Absolute repository root.
 * @param activeLinkedCount - Currently active linked worktrees.
 * @param perWorktreeDiskSavedBytes - Estimated bytes saved per provisioned worktree.
 * @param perWorktreeTimeSavedMs - Estimated milliseconds saved per provisioned worktree.
 * @returns Synthesized `RepoLifetimeStats` baseline.
 * @example
 * const baseline = await bootstrapRepoStatsFromHistory('/code/app', 1, 50_000_000, 20_000);
 */
export async function bootstrapRepoStatsFromHistory(
  mainRoot: string,
  activeLinkedCount: number,
  perWorktreeDiskSavedBytes: number,
  perWorktreeTimeSavedMs: number,
): Promise<RepoLifetimeStats> {
  const baseline = emptyRepoLifetimeStats();
  const entries = await readLedger(mainRoot).catch(() => []);
  let concurrent = 0;

  for (const entry of entries) {
    const at = entry.date ?? new Date();
    const iso = at.toISOString();
    const dateKey = toDateKey(at);
    if (entry.title.startsWith('Worktree Provisioned:')) {
      baseline.createdCount += 1;
      concurrent += 1;
      baseline.peakConcurrentWorktrees = Math.max(baseline.peakConcurrentWorktrees, concurrent);
      baseline.cumulativeDiskSavedBytes += perWorktreeDiskSavedBytes;
      baseline.cumulativeTimeSavedMs += perWorktreeTimeSavedMs;
      touchActivityWindow(baseline, iso);
      baseline.dailyActivity = upsertDailyBucket(baseline.dailyActivity, dateKey, {
        created: 1,
        diskSavedBytes: perWorktreeDiskSavedBytes,
        timeSavedMs: perWorktreeTimeSavedMs,
      });
    } else if (entry.title.startsWith('Dependencies Isolated:')) {
      baseline.isolatedCount += 1;
      touchActivityWindow(baseline, iso);
      baseline.dailyActivity = upsertDailyBucket(baseline.dailyActivity, dateKey, { isolated: 1 });
    } else if (entry.title.startsWith('Worktree Removed:')) {
      baseline.removedCount += 1;
      concurrent = Math.max(0, concurrent - 1);
      touchActivityWindow(baseline, iso);
      baseline.dailyActivity = upsertDailyBucket(baseline.dailyActivity, dateKey, { removed: 1 });
    }
  }

  if (activeLinkedCount > baseline.createdCount) {
    const missing = activeLinkedCount - baseline.createdCount;
    baseline.createdCount = activeLinkedCount;
    baseline.cumulativeDiskSavedBytes += missing * perWorktreeDiskSavedBytes;
    baseline.cumulativeTimeSavedMs += missing * perWorktreeTimeSavedMs;
  }
  baseline.peakConcurrentWorktrees = Math.max(baseline.peakConcurrentWorktrees, activeLinkedCount);
  return baseline;
}
