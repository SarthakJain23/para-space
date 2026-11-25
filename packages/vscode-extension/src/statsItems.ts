import { type ParaSpaceStats, type WorktreeInfo, formatBytes, formatDuration } from '@para-space/core';
import { worktreeTooltip } from './items.js';

export interface StatsRowModel {
  label: string;
  description: string;
  tooltip: string;
  icon: string;
  contextValue?: string;
  worktreePath?: string;
  repoRoot?: string;
}

export interface StatsSectionModel {
  id: string;
  label: string;
  description: string;
  icon: string;
  expanded: boolean;
  children: StatsRowModel[];
}

export interface StorageSegments {
  workingTreeBytes: number;
  isolatedDepsBytes: number;
  savedBytes: number;
  workingTreePct: number;
  isolatedDepsPct: number;
  savedPct: number;
}

function metric(value: string, measured: boolean): string {
  return measured ? value : 'Measuring…';
}

function row(
  label: string,
  description: string,
  tooltip: string,
  icon: string,
  extra?: Pick<StatsRowModel, 'contextValue' | 'worktreePath' | 'repoRoot'>,
): StatsRowModel {
  return { label, description, tooltip, icon, ...extra };
}

/**
 * Builds the 4 collapsible sidebar tree sections (Savings, Live Overview, Disk Usage, Lifetime Activity)
 * from a `ParaSpaceStats` snapshot. Pure and VS Code–free for unit testing (D-030, D-055).
 */
export function buildStatsSections(stats: ParaSpaceStats): StatsSectionModel[] {
  const { summary, lifetime, diskMeasured } = stats;

  const savingsRows: StatsRowModel[] = [
    row(
      'Live Disk Saved',
      metric(formatBytes(summary.liveDiskSavedBytes), diskMeasured),
      'Disk space currently avoided by symlinked dependencies and shared .git/objects.',
      'database',
    ),
    row(
      'Live Est. Time Saved',
      `~${formatDuration(summary.liveTimeSavedMs)}`,
      'Estimated clone + dependency install time avoided for currently active worktrees.',
      'clock',
    ),
    row(
      'Lifetime Disk Saved',
      formatBytes(lifetime.cumulativeDiskSavedBytes),
      'Cumulative disk space saved across all ParaSpace worktrees ever provisioned.',
      'sparkle',
    ),
    row(
      'Lifetime Est. Time Saved',
      `~${formatDuration(lifetime.cumulativeTimeSavedMs)}`,
      'Cumulative estimated setup time saved across all ParaSpace worktrees ever provisioned.',
      'history',
    ),
  ];

  const alertSummary =
    summary.dirtyCount > 0 || summary.divergedCount > 0
      ? `${summary.dirtyCount} dirty · ${summary.divergedCount} diverged`
      : 'All clean';

  const overviewRows: StatsRowModel[] = [
    row(
      'Repositories',
      summary.totalRepos > summary.activeRepos
        ? `${summary.activeRepos} active (${summary.totalRepos - summary.activeRepos} missing)`
        : String(summary.activeRepos),
      'Repositories included in the current stats scope.',
      'repo',
    ),
    row(
      'Active Worktrees',
      `${summary.activeWorktrees} (${summary.symlinkedCount} shared · ${summary.isolatedCount} isolated)`,
      `${summary.linkedWorktrees} linked worktree(s) across ${summary.activeRepos} active repo(s).`,
      'git-branch',
    ),
    row(
      'Multi-Repo Workspaces',
      String(summary.totalWorkspaces),
      'Active multi-repository .code-workspace records in scope.',
      'root-folder',
    ),
    row(
      'Allocated Ports',
      String(summary.portsAllocated),
      'Active dev server ports assigned across worktrees.',
      'plug',
    ),
    row(
      'Health Alerts',
      alertSummary,
      'Worktrees with uncommitted changes or diverged dependency manifests.',
      summary.divergedCount > 0 ? 'warning' : 'pass',
    ),
  ];

  const diskRows: StatsRowModel[] = [
    row(
      'Total On-Disk Usage',
      metric(formatBytes(summary.totalDiskUsageBytes), diskMeasured),
      'Actual on-disk footprint across repos and worktrees (symlinks not double-counted).',
      'pie-chart',
    ),
    row(
      'Isolated Dependencies',
      metric(formatBytes(summary.isolatedDepsBytes), diskMeasured),
      'Disk space used by isolated (non-symlinked) dependency directories inside linked worktrees.',
      'package',
    ),
    ...stats.repos
      .filter((r) => !r.missing)
      .map((r) =>
        row(
          r.name,
          `${metric(formatBytes(r.totalDiskUsageBytes), diskMeasured)} · saved ${metric(formatBytes(r.liveDiskSavedBytes), diskMeasured)}`,
          `${r.mainRoot}\n${r.activeWorktrees} worktree(s) · ${r.symlinkedCount} shared · ${r.isolatedCount} isolated`,
          'folder',
          { repoRoot: r.mainRoot },
        ),
      ),
  ];

  const lifetimeRows: StatsRowModel[] = [
    row('Worktrees Created', String(lifetime.createdCount), 'Total worktrees provisioned in this scope.', 'add'),
    row('Dependencies Isolated', String(lifetime.isolatedCount), 'Total breakaway isolation operations.', 'layers'),
    row('Worktrees Removed', String(lifetime.removedCount), 'Total worktrees cleaned up.', 'trash'),
    row(
      'Peak Concurrency',
      `${lifetime.peakConcurrentWorktrees} linked`,
      'Highest simultaneous linked worktrees.',
      'pulse',
    ),
    row('Active Days Tracked', String(stats.activitySeries.length), 'Days with activity (90-day window).', 'calendar'),
  ];

  return [
    {
      id: 'savings',
      label: 'Savings',
      description: diskMeasured
        ? `${formatBytes(summary.liveDiskSavedBytes)} · ~${formatDuration(summary.liveTimeSavedMs)}`
        : `~${formatDuration(summary.liveTimeSavedMs)}`,
      icon: 'sparkle',
      expanded: true,
      children: savingsRows,
    },
    {
      id: 'overview',
      label: 'Live Overview',
      description: `${summary.activeWorktrees} worktrees`,
      icon: 'dashboard',
      expanded: true,
      children: overviewRows,
    },
    {
      id: 'disk',
      label: 'Disk Usage',
      description: metric(formatBytes(summary.totalDiskUsageBytes), diskMeasured),
      icon: 'database',
      expanded: false,
      children: diskRows,
    },
    {
      id: 'lifetime',
      label: 'Lifetime Activity',
      description: `${lifetime.createdCount} created`,
      icon: 'graph',
      expanded: false,
      children: lifetimeRows,
    },
  ];
}

/**
 * Computes percentage segments for the Webview stacked storage bar (working trees vs. isolated deps vs. saved).
 */
export function computeStorageSegments(stats: ParaSpaceStats): StorageSegments {
  const isolatedDepsBytes = Math.max(0, stats.summary.isolatedDepsBytes);
  const workingTreeBytes = Math.max(0, stats.summary.totalDiskUsageBytes - isolatedDepsBytes);
  const savedBytes = Math.max(0, stats.summary.liveDiskSavedBytes);
  const total = workingTreeBytes + isolatedDepsBytes + savedBytes;
  if (total <= 0) {
    return {
      workingTreeBytes: 0,
      isolatedDepsBytes: 0,
      savedBytes: 0,
      workingTreePct: 0,
      isolatedDepsPct: 0,
      savedPct: 0,
    };
  }
  return {
    workingTreeBytes,
    isolatedDepsBytes,
    savedBytes,
    workingTreePct: Math.round((workingTreeBytes / total) * 100),
    isolatedDepsPct: Math.round((isolatedDepsBytes / total) * 100),
    savedPct: Math.round((savedBytes / total) * 100),
  };
}

/**
 * Formats a Markdown tooltip for the ParaSpace status bar item, combining active worktree details
 * with live stats and clickable command links.
 */
export function buildStatusBarStatsMarkdown(current: WorktreeInfo, stats?: ParaSpaceStats): string {
  const baseLines = worktreeTooltip(current)
    .split('\n')
    .map((line) => line.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1'));

  const parts: string[] = [baseLines.join('  \n')];
  if (stats) {
    const disk = stats.diskMeasured ? formatBytes(stats.summary.liveDiskSavedBytes) : 'Measuring…';
    const time = `~${formatDuration(stats.summary.liveTimeSavedMs)}`;
    parts.push(
      '---',
      `**ParaSpace Stats (${stats.scope === 'global' ? 'All Repos' : 'Workspace'})**  \n` +
        `Active: **${stats.summary.activeWorktrees}** (${stats.summary.symlinkedCount} shared · ${stats.summary.isolatedCount} isolated)  \n` +
        `Saved: **${disk}** · **${time}**  \n` +
        `Lifetime: **${stats.lifetime.createdCount}** created · **${formatBytes(stats.lifetime.cumulativeDiskSavedBytes)}** saved`,
    );
  }
  parts.push(
    '---',
    '[Switch Worktree](command:paraSpace.listWorktrees) · [Open Stats Dashboard](command:paraSpace.openStatsDashboard)',
  );
  return parts.join('\n\n');
}
