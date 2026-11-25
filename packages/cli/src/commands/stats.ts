import type { Command } from 'commander';
import Table from 'cli-table3';
import pc from 'picocolors';
import { type ParaSpaceStats, formatBytes, formatDuration, getStats } from '@para-space/core';
import { action, log, printJson } from '../runtime.js';

function formatMetric(value: string, measured: boolean): string {
  return measured ? value : pc.dim('(skipped)');
}

function renderSummary(stats: ParaSpaceStats): string {
  const { summary, lifetime, diskMeasured } = stats;
  const scopeLabel = stats.scope === 'global' ? 'All Repositories' : 'Current Workspace';
  const lines: string[] = [
    pc.bold(`ParaSpace Stats — ${scopeLabel}`),
    '',
    pc.cyan('Savings'),
    `  Live disk saved:      ${pc.green(formatMetric(formatBytes(summary.liveDiskSavedBytes), diskMeasured))}`,
    `  Live time saved:      ${pc.green(`~${formatDuration(summary.liveTimeSavedMs)}`)}`,
    `  Lifetime disk saved:  ${pc.green(formatBytes(lifetime.cumulativeDiskSavedBytes))}`,
    `  Lifetime time saved:  ${pc.green(`~${formatDuration(lifetime.cumulativeTimeSavedMs)}`)}`,
    '',
    pc.cyan('Live Overview'),
    `  Repositories:         ${summary.activeRepos}${summary.totalRepos > summary.activeRepos ? pc.dim(` (${summary.totalRepos - summary.activeRepos} missing)`) : ''}`,
    `  Active worktrees:     ${summary.activeWorktrees} (${summary.linkedWorktrees} linked · ${summary.symlinkedCount} shared · ${summary.isolatedCount} isolated)`,
    `  Multi-repo spaces:    ${summary.totalWorkspaces}`,
    `  Allocated ports:      ${summary.portsAllocated}`,
    `  Status alerts:        ${summary.dirtyCount ? pc.yellow(`${summary.dirtyCount} dirty`) : pc.green('0 dirty')} · ${summary.divergedCount ? pc.yellow(`${summary.divergedCount} diverged`) : pc.green('0 diverged')}`,
    `  Actual disk usage:    ${formatMetric(formatBytes(summary.totalDiskUsageBytes), diskMeasured)}${diskMeasured && summary.isolatedDepsBytes > 0 ? pc.dim(` (${formatBytes(summary.isolatedDepsBytes)} isolated deps)`) : ''}`,
    '',
    pc.cyan('Lifetime Activity'),
    `  Created / Isolated / Removed:  ${lifetime.createdCount} / ${lifetime.isolatedCount} / ${lifetime.removedCount}`,
    `  Peak concurrent worktrees:     ${lifetime.peakConcurrentWorktrees}`,
  ];
  return lines.join('\n');
}

function renderRepoTable(stats: ParaSpaceStats): string {
  const table = new Table({
    head: ['Repository', 'Worktrees', 'Deps (Shared/Iso)', 'Disk Usage', 'Disk Saved', 'Est. Time Saved', 'Created'],
    style: { head: ['cyan'] },
  });
  for (const r of stats.repos) {
    table.push([
      r.missing ? `${r.name} ${pc.dim('(missing)')}` : r.name,
      r.missing ? pc.dim('—') : `${r.activeWorktrees} (${r.linkedWorktrees} linked)`,
      r.missing ? pc.dim('—') : `${r.symlinkedCount} / ${r.isolatedCount}`,
      r.missing ? pc.dim('—') : formatMetric(formatBytes(r.totalDiskUsageBytes), stats.diskMeasured),
      r.missing ? pc.dim('—') : pc.green(formatMetric(formatBytes(r.liveDiskSavedBytes), stats.diskMeasured)),
      r.missing ? pc.dim('—') : pc.green(`~${formatDuration(r.liveTimeSavedMs)}`),
      String(r.lifetime.createdCount),
    ]);
  }
  return table.toString();
}

function renderWorktreeTable(stats: ParaSpaceStats): string {
  const table = new Table({
    head: ['Repo', 'Worktree', 'Branch', 'Mode', 'Disk Usage', 'Disk Saved', 'Port', 'Status'],
    style: { head: ['cyan'] },
  });
  for (const r of stats.repos) {
    for (const wt of r.worktrees) {
      const mode = wt.diverged ? pc.yellow(`${wt.depsMode} (diverged)`) : wt.depsMode;
      const status = wt.dirty > 0 ? pc.yellow(`${wt.dirty} dirty`) : pc.green('Clean');
      table.push([
        r.name,
        wt.name,
        wt.branch ?? '',
        mode,
        formatMetric(formatBytes(wt.diskUsageBytes), stats.diskMeasured),
        wt.isMain ? pc.dim('—') : pc.green(formatMetric(formatBytes(wt.diskSavedBytes), stats.diskMeasured)),
        wt.port ?? pc.dim('—'),
        status,
      ]);
    }
  }
  return table.toString();
}

export function registerStats(program: Command) {
  program
    .command('stats')
    .description('Show disk/time savings, live overview, disk usage, and lifetime activity stats')
    .option('-a, --all', 'aggregate stats across all tracked repositories on this machine')
    .option('--json', 'print raw stats payload as JSON')
    .option('--no-disk', 'skip directory size scanning for instant output')
    .option('-v, --verbose', 'include per-worktree breakdown table')
    .action(
      action(async (flags: { all?: boolean; json?: boolean; disk?: boolean; verbose?: boolean }) => {
        const stats = await getStats({
          cwd: process.cwd(),
          scope: flags.all ? 'global' : 'repo',
          includeDiskUsage: flags.disk !== false,
          log,
        });

        if (flags.json) {
          printJson(stats);
          return;
        }

        console.log(renderSummary(stats));
        if (stats.repos.length > 0) {
          console.log('\n' + renderRepoTable(stats));
        }
        if (flags.verbose && stats.repos.some((r) => r.worktrees.length > 0)) {
          console.log('\n' + renderWorktreeTable(stats));
        }
      }),
    );
}
