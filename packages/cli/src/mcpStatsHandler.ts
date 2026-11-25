import { type StatsScope, formatBytes, formatDuration, getStats } from '@para-space/core';

/** Handles the `para_stats` MCP tool invocation. */
export async function handleGetStats(args: { scope?: StatsScope; includeDiskUsage?: boolean; cwd?: string }) {
  const { scope = 'repo', includeDiskUsage = true, cwd = process.cwd() } = args;
  try {
    const stats = await getStats({ cwd, scope, includeDiskUsage });
    const summaryText = [
      `Scope: ${stats.scope}`,
      `Live disk saved: ${stats.diskMeasured ? formatBytes(stats.summary.liveDiskSavedBytes) : 'skipped'}`,
      `Live est. time saved: ~${formatDuration(stats.summary.liveTimeSavedMs)}`,
      `Lifetime disk saved: ${formatBytes(stats.lifetime.cumulativeDiskSavedBytes)}`,
      `Lifetime est. time saved: ~${formatDuration(stats.lifetime.cumulativeTimeSavedMs)}`,
      `Active worktrees: ${stats.summary.activeWorktrees} (${stats.summary.linkedWorktrees} linked, ${stats.summary.symlinkedCount} shared, ${stats.summary.isolatedCount} isolated)`,
      `Lifetime created/isolated/removed: ${stats.lifetime.createdCount}/${stats.lifetime.isolatedCount}/${stats.lifetime.removedCount} (peak ${stats.lifetime.peakConcurrentWorktrees})`,
    ].join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ summaryText, ...stats }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error computing ParaSpace stats: ${(err as Error).message}` }],
    };
  }
}
