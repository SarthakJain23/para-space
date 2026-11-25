import { type StatsScope, formatBytes, formatDuration, getStats } from '@para-space/core';
import type { CommandContext } from './commands/context.js';
import { makeToolResult } from './lmToolHandlers.js';

/** Handles `para_stats` Language Model Tool invocation. */
export async function invokeGetStats(
  { store, rt }: CommandContext,
  input?: { scope?: StatsScope; includeDiskUsage?: boolean },
): Promise<unknown> {
  try {
    await store.load();
    const scope = input?.scope ?? 'repo';
    const includeDiskUsage = input?.includeDiskUsage ?? true;
    const cwd = store.root ?? store.roots[0] ?? process.cwd();
    const stats = await getStats({
      cwd,
      scope,
      includeDiskUsage,
      repoRoots: scope === 'repo' && store.roots.length > 0 ? store.roots : undefined,
      log: rt.log,
    });

    const lines = [
      `# ParaSpace Stats (${stats.scope === 'global' ? 'All Repositories' : 'Current Workspace'})`,
      '',
      `- Live disk saved: ${stats.diskMeasured ? formatBytes(stats.summary.liveDiskSavedBytes) : 'skipped'}`,
      `- Live est. time saved: ~${formatDuration(stats.summary.liveTimeSavedMs)}`,
      `- Lifetime disk saved: ${formatBytes(stats.lifetime.cumulativeDiskSavedBytes)}`,
      `- Lifetime est. time saved: ~${formatDuration(stats.lifetime.cumulativeTimeSavedMs)}`,
      `- Active worktrees: ${stats.summary.activeWorktrees} (${stats.summary.linkedWorktrees} linked · ${stats.summary.symlinkedCount} shared · ${stats.summary.isolatedCount} isolated)`,
      `- Multi-repo workspaces: ${stats.summary.totalWorkspaces}`,
      `- Actual disk usage: ${stats.diskMeasured ? formatBytes(stats.summary.totalDiskUsageBytes) : 'skipped'}`,
      `- Lifetime created / isolated / removed: ${stats.lifetime.createdCount} / ${stats.lifetime.isolatedCount} / ${stats.lifetime.removedCount} (peak concurrent: ${stats.lifetime.peakConcurrentWorktrees})`,
      '',
      '```json',
      JSON.stringify(stats, null, 2),
      '```',
    ];
    return makeToolResult(lines.join('\n'));
  } catch (err) {
    return makeToolResult(`Failed to compute ParaSpace stats: ${(err as Error).message}`);
  }
}
