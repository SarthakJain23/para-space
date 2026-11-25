import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorktree, isolateWorktree, removeWorktree } from '../src/commands/index.js';
import { appendLedger } from '../src/ledger.js';
import {
  type DailyActivityBucket,
  MAX_ACTIVITY_DAYS,
  bootstrapRepoStatsFromHistory,
  clearSizeCache,
  estimateTimeSavedMs,
  formatBytes,
  formatDuration,
  getStats,
  measureDirBytes,
  mergeDailyActivity,
  mergeLifetimeCounters,
  readStatsStore,
  statsPath,
  upsertDailyBucket,
} from '../src/stats/index.js';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('stats unit helpers', () => {
  it('formats bytes and durations cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');

    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(400)).toBe('< 1s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(95_000)).toBe('1m 35s');
    expect(formatDuration(3_720_000)).toBe('1h 2m');
  });

  it('estimates time saved with deterministic bounds', () => {
    const gitOnly = estimateTimeSavedMs({ linkedDepRels: [], linkedDepsBytes: 0, sharedGitBytes: 0 });
    expect(gitOnly).toBe(3_000);

    const nodeSmall = estimateTimeSavedMs({
      linkedDepRels: ['node_modules'],
      linkedDepsBytes: 50 * 1024 * 1024,
      sharedGitBytes: 10 * 1024 * 1024,
    });
    expect(nodeSmall).toBeGreaterThan(gitOnly);
    expect(nodeSmall).toBe(23_000);

    const huge = estimateTimeSavedMs({
      linkedDepRels: ['node_modules'],
      linkedDepsBytes: 50 * 1024 * 1024 * 1024,
      sharedGitBytes: 50 * 1024 * 1024 * 1024,
    });
    expect(huge).toBe(240_000);
  });

  it('caps daily buckets to MAX_ACTIVITY_DAYS and merges across repos', () => {
    let buckets: DailyActivityBucket[] = [];
    for (let i = 0; i < MAX_ACTIVITY_DAYS + 10; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      buckets = upsertDailyBucket(buckets, d, { created: 1, diskSavedBytes: 100, timeSavedMs: 1000 });
    }
    expect(buckets).toHaveLength(MAX_ACTIVITY_DAYS);

    const merged = mergeDailyActivity([
      [{ date: '2026-05-01', created: 2, isolated: 1, removed: 0, diskSavedBytes: 100, timeSavedMs: 2000 }],
      [{ date: '2026-05-01', created: 1, isolated: 0, removed: 1, diskSavedBytes: 50, timeSavedMs: 1000 }],
    ]);
    expect(merged).toEqual([
      { date: '2026-05-01', created: 3, isolated: 1, removed: 1, diskSavedBytes: 150, timeSavedMs: 3000 },
    ]);

    const life = mergeLifetimeCounters([
      {
        createdCount: 2,
        isolatedCount: 1,
        removedCount: 1,
        peakConcurrentWorktrees: 2,
        cumulativeDiskSavedBytes: 500,
        cumulativeTimeSavedMs: 10_000,
        firstActivityAt: '2026-05-01T00:00:00.000Z',
        lastActivityAt: '2026-05-02T00:00:00.000Z',
      },
      {
        createdCount: 3,
        isolatedCount: 0,
        removedCount: 2,
        peakConcurrentWorktrees: 4,
        cumulativeDiskSavedBytes: 800,
        cumulativeTimeSavedMs: 20_000,
        firstActivityAt: '2026-04-01T00:00:00.000Z',
        lastActivityAt: '2026-05-03T00:00:00.000Z',
      },
    ]);
    expect(life.createdCount).toBe(5);
    expect(life.peakConcurrentWorktrees).toBe(4);
    expect(life.firstActivityAt).toBe('2026-04-01T00:00:00.000Z');
    expect(life.lastActivityAt).toBe('2026-05-03T00:00:00.000Z');
  });

  it('measures directories without following symlinks', async () => {
    const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'para-measure-')));
    try {
      clearSizeCache();
      const target = path.join(tmp, 'big-target');
      const container = path.join(tmp, 'worktree');
      await mkdir(target, { recursive: true });
      await mkdir(container, { recursive: true });
      await writeFile(path.join(target, 'blob.bin'), Buffer.alloc(512 * 1024, 1));
      await writeFile(path.join(container, 'small.txt'), 'hi\n');
      await symlink(target, path.join(container, 'node_modules'));

      const targetBytes = await measureDirBytes(target, { useCache: false });
      const linkBytes = await measureDirBytes(path.join(container, 'node_modules'), { useCache: false });
      const containerBytes = await measureDirBytes(container, { useCache: false });

      expect(targetBytes).toBeGreaterThanOrEqual(512 * 1024);
      expect(linkBytes).toBe(0);
      expect(containerBytes).toBeLessThan(targetBytes);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('stats lifecycle integration', () => {
  let sandbox: string;
  let repo: string;

  async function initRepo(name: string, payloadBytes = 256 * 1024): Promise<string> {
    const dir = path.join(sandbox, name);
    await mkdir(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(dir, 'node_modules', 'pkg', 'bundle.js'), Buffer.alloc(payloadBytes, 65));
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name }));
    await writeFile(path.join(dir, '.gitignore'), 'node_modules/\n.env.local\n');
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '.');
    git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
    return dir;
  }

  beforeEach(async () => {
    clearSizeCache();
    sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'para-stats-')));
    process.env.PARA_SPACE_HOME = path.join(sandbox, 'home');
    repo = await initRepo('app');
  });

  afterEach(async () => {
    delete process.env.PARA_SPACE_HOME;
    await rm(sandbox, { recursive: true, force: true });
  });

  it('tracks create → isolate → remove with persistent lifetime stats and global scope', async () => {
    await createWorktree({ cwd: repo, branch: 'feat/one', base: 'main', ide: 'no' });
    await createWorktree({ cwd: repo, branch: 'feat/two', base: 'main', ide: 'no' });

    clearSizeCache();
    const afterCreate = await getStats({ cwd: repo });
    expect(afterCreate.scope).toBe('repo');
    expect(afterCreate.diskMeasured).toBe(true);
    expect(afterCreate.summary.linkedWorktrees).toBe(2);
    expect(afterCreate.summary.symlinkedCount).toBe(2);
    expect(afterCreate.summary.liveDiskSavedBytes).toBeGreaterThanOrEqual(512 * 1024);
    expect(afterCreate.summary.liveTimeSavedMs).toBeGreaterThan(0);
    expect(afterCreate.lifetime.createdCount).toBe(2);
    expect(afterCreate.lifetime.peakConcurrentWorktrees).toBe(2);
    expect(afterCreate.lifetime.cumulativeDiskSavedBytes).toBeGreaterThanOrEqual(512 * 1024);
    expect(afterCreate.activitySeries.length).toBeGreaterThanOrEqual(1);

    await isolateWorktree({ cwd: repo, target: 'feat/one', reason: 'test isolation' });
    clearSizeCache();
    const afterIsolate = await getStats({ cwd: repo });
    expect(afterIsolate.summary.symlinkedCount).toBe(1);
    expect(afterIsolate.summary.isolatedCount).toBe(1);
    expect(afterIsolate.summary.isolatedDepsBytes).toBeGreaterThan(0);
    expect(afterIsolate.lifetime.isolatedCount).toBe(1);

    await removeWorktree({ cwd: repo, target: 'feat/two', deleteBranch: true });
    const afterRemove = await getStats({ cwd: repo });
    expect(afterRemove.summary.linkedWorktrees).toBe(1);
    expect(afterRemove.lifetime.createdCount).toBe(2);
    expect(afterRemove.lifetime.removedCount).toBe(1);
    expect(afterRemove.lifetime.cumulativeDiskSavedBytes).toBe(afterCreate.lifetime.cumulativeDiskSavedBytes);

    // Second repo + global aggregation + missing repo resilience
    const repoB = await initRepo('api', 128 * 1024);
    await createWorktree({ cwd: repoB, branch: 'feat/api', base: 'main', ide: 'no' });
    const globalStats = await getStats({ cwd: repo, scope: 'global' });
    expect(globalStats.summary.totalRepos).toBe(2);
    expect(globalStats.lifetime.createdCount).toBe(3);

    // Delete repoB on disk and confirm global stats still report its lifetime counters cleanly
    await rm(repoB, { recursive: true, force: true });
    const afterDelete = await getStats({ cwd: repo, scope: 'global' });
    const missing = afterDelete.repos.find((r) => r.mainRoot === repoB);
    expect(missing?.missing).toBe(true);
    expect(missing?.lifetime.createdCount).toBe(1);

    // Fast path without disk measurement
    const fast = await getStats({ cwd: repo, includeDiskUsage: false });
    expect(fast.diskMeasured).toBe(false);
    expect(fast.summary.totalDiskUsageBytes).toBe(0);
    expect(fast.summary.linkedWorktrees).toBe(1);
  });

  it('recovers gracefully from corrupt stats.json and bootstraps from ledger', async () => {
    await mkdir(path.dirname(statsPath()), { recursive: true });
    await writeFile(statsPath(), '{not-valid-json');
    expect((await readStatsStore()).repos).toEqual({});

    await appendLedger(repo, {
      title: 'Worktree Provisioned: feat/legacy',
      requirement: 'Legacy ticket',
      decisions: ['Symlinked node_modules'],
      problemSolved: 'Fast setup',
      date: new Date('2026-06-01T10:00:00.000Z'),
    });
    await appendLedger(repo, {
      title: 'Worktree Removed: feat/legacy',
      requirement: 'Done',
      decisions: ['Removed'],
      problemSolved: 'Cleanup',
      date: new Date('2026-06-02T10:00:00.000Z'),
    });

    const bootstrapped = await bootstrapRepoStatsFromHistory(repo, 0, 1024, 20_000);
    expect(bootstrapped.createdCount).toBe(1);
    expect(bootstrapped.removedCount).toBe(1);
    expect(bootstrapped.peakConcurrentWorktrees).toBe(1);
    expect(bootstrapped.cumulativeDiskSavedBytes).toBe(1024);
  });
});
