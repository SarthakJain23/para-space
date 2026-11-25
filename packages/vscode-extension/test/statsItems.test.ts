import type { ParaSpaceStats, WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import { buildStatsSections, buildStatusBarStatsMarkdown, computeStorageSegments } from '../src/statsItems.js';
import { renderStatsDashboardHtml } from '../src/statsWebviewHtml.js';

const sampleStats: ParaSpaceStats = {
  scope: 'repo',
  generatedAt: '2026-11-25T10:00:00.000Z',
  diskMeasured: true,
  summary: {
    totalRepos: 1,
    activeRepos: 1,
    activeWorktrees: 3,
    linkedWorktrees: 2,
    managedWorktrees: 3,
    symlinkedCount: 1,
    isolatedCount: 1,
    dirtyCount: 1,
    divergedCount: 0,
    portsAllocated: 3,
    totalWorkspaces: 1,
    totalDiskUsageBytes: 600 * 1024 * 1024,
    isolatedDepsBytes: 200 * 1024 * 1024,
    liveDiskSavedBytes: 400 * 1024 * 1024,
    liveTimeSavedMs: 65_000,
  },
  lifetime: {
    createdCount: 5,
    isolatedCount: 1,
    removedCount: 3,
    peakConcurrentWorktrees: 3,
    cumulativeDiskSavedBytes: 1200 * 1024 * 1024,
    cumulativeTimeSavedMs: 240_000,
  },
  activitySeries: [
    {
      date: '2026-11-24',
      created: 2,
      isolated: 0,
      removed: 1,
      diskSavedBytes: 400 * 1024 * 1024,
      timeSavedMs: 90_000,
    },
    {
      date: '2026-11-25',
      created: 3,
      isolated: 1,
      removed: 2,
      diskSavedBytes: 800 * 1024 * 1024,
      timeSavedMs: 150_000,
    },
  ],
  repos: [
    {
      mainRoot: '/code/app',
      name: 'app',
      missing: false,
      activeWorktrees: 3,
      linkedWorktrees: 2,
      managedWorktrees: 3,
      symlinkedCount: 1,
      isolatedCount: 1,
      dirtyCount: 1,
      divergedCount: 0,
      portsAllocated: [3000, 3001, 3002],
      sharedDepsSizeBytes: 350 * 1024 * 1024,
      sharedGitSizeBytes: 50 * 1024 * 1024,
      totalDiskUsageBytes: 600 * 1024 * 1024,
      isolatedDepsBytes: 200 * 1024 * 1024,
      liveDiskSavedBytes: 400 * 1024 * 1024,
      liveTimeSavedMs: 65_000,
      lifetime: {
        createdCount: 5,
        isolatedCount: 1,
        removedCount: 3,
        peakConcurrentWorktrees: 3,
        cumulativeDiskSavedBytes: 1200 * 1024 * 1024,
        cumulativeTimeSavedMs: 240_000,
      },
      worktrees: [
        {
          name: '(main)',
          path: '/code/app',
          branch: 'main',
          isMain: true,
          managed: true,
          depsMode: 'Source',
          dirty: 0,
          diverged: false,
          port: 3000,
          diskUsageBytes: 380 * 1024 * 1024,
          isolatedDepsBytes: 0,
          diskSavedBytes: 0,
        },
        {
          name: 'app-feat-auth',
          path: '/home/.para-space/worktrees/code/app-feat-auth',
          branch: 'feat/<script>auth</script>',
          isMain: false,
          managed: true,
          depsMode: 'Symlinked',
          dirty: 2,
          diverged: false,
          port: 3001,
          color: '#137d87',
          diskUsageBytes: 10 * 1024 * 1024,
          isolatedDepsBytes: 0,
          diskSavedBytes: 400 * 1024 * 1024,
        },
      ],
    },
  ],
  workspaces: {
    totalWorkspaces: 1,
    workspaces: [
      { name: 'fullstack', branch: 'feat/auth', workspaceFile: '/home/fullstack.code-workspace', repoCount: 2 },
    ],
  },
};

describe('statsItems & statsWebviewHtml', () => {
  it('builds 4 sidebar sections with expected metrics', () => {
    const sections = buildStatsSections(sampleStats);
    expect(sections.map((s) => s.id)).toEqual(['savings', 'overview', 'disk', 'lifetime']);
    expect(sections[0].children[0].description).toBe('400 MB');
    expect(sections[0].children[1].description).toBe('~1m 5s');
    expect(sections[1].children[1].description).toContain('3');
    expect(sections[3].children[0].description).toBe('5');
  });

  it('computes storage breakdown percentages accurately', () => {
    const seg = computeStorageSegments(sampleStats);
    expect(seg.workingTreePct).toBe(40);
    expect(seg.isolatedDepsPct).toBe(20);
    expect(seg.savedPct).toBe(40);
  });

  it('builds status bar markdown tooltip with stats and dashboard link', () => {
    const current: WorktreeInfo = {
      name: 'app-feat-auth',
      path: '/code/app-feat-auth',
      branch: 'feat/auth',
      isMain: false,
      dirty: 0,
      port: 3001,
      depsMode: 'Symlinked',
      managed: true,
    };
    const md = buildStatusBarStatsMarkdown(current, sampleStats);
    expect(md).toContain('400 MB');
    expect(md).toContain('command:paraSpace.openStatsDashboard');
    expect(md).toContain('command:paraSpace.listWorktrees');
  });

  it('renders CSP-safe webview HTML and escapes untrusted branch names', () => {
    const html = renderStatsDashboardHtml(sampleStats, 'test-nonce-123');
    expect(html).toContain("script-src 'nonce-test-nonce-123'");
    expect(html).not.toContain('<script>auth</script>');
    expect(html).toContain('&lt;script&gt;auth&lt;/script&gt;');
    expect(html).toContain('400 MB');
    expect(html).toContain('data-action="isolate"');
    expect(html).toContain('<svg class="chart"');
  });
});
