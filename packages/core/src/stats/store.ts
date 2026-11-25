import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sharedPaths } from '../frameworks/index.js';
import { paraSpaceHome } from '../paths.js';
import { readTextIfExists } from '../util/fs.js';
import { withFileLock } from '../util/lock.js';
import { emptyRepoLifetimeStats, toDateKey, touchActivityWindow, upsertDailyBucket } from './aggregate.js';
import { estimateTimeSavedMs, measureRepoSharedSizes } from './measure.js';
import type { StatsStoreFile } from './types.js';

/**
 * Returns the path to the persistent ParaSpace stats store (`~/.para-space/stats.json`) (D-055).
 *
 * @returns Absolute path to `stats.json`.
 *
 * @example
 * const file = statsPath(); // → '/Users/you/.para-space/stats.json'
 */
export function statsPath(): string {
  return path.join(paraSpaceHome(), 'stats.json');
}

/**
 * Returns the path to the lock file serializing writes to `stats.json`.
 *
 * @returns Absolute path to `stats.lock`.
 *
 * @example
 * const lock = statsLockPath();
 */
export function statsLockPath(): string {
  return path.join(paraSpaceHome(), 'stats.lock');
}

/**
 * Reads and parses `~/.para-space/stats.json`, returning an empty store when missing or corrupt.
 *
 * @returns Parsed `StatsStoreFile`.
 *
 * @example
 * const store = await readStatsStore();
 */
export async function readStatsStore(): Promise<StatsStoreFile> {
  const text = await readTextIfExists(statsPath());
  try {
    const parsed = text && (JSON.parse(text) as StatsStoreFile);
    if (parsed && parsed.version === 1 && parsed.repos && typeof parsed.repos === 'object') {
      return parsed;
    }
  } catch {
    // corrupt → start fresh
  }
  return { version: 1, repos: {} };
}

async function writeStatsStore(store: StatsStoreFile): Promise<void> {
  await mkdir(paraSpaceHome(), { recursive: true });
  const tmp = `${statsPath()}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + '\n');
  await rename(tmp, statsPath());
}

/**
 * Read-modify-write `~/.para-space/stats.json` as a single locked transaction.
 *
 * @param fn - Mutates the `StatsStoreFile` in place.
 * @returns Whatever `fn` returns.
 *
 * @example
 * await updateStatsStore((store) => { ... });
 */
export async function updateStatsStore<T>(fn: (store: StatsStoreFile) => T | Promise<T>): Promise<T> {
  await mkdir(paraSpaceHome(), { recursive: true });
  return withFileLock(statsLockPath(), async () => {
    const store = await readStatsStore();
    const result = await fn(store);
    await writeStatsStore(store);
    return result;
  });
}

/**
 * Records a worktree creation event in `~/.para-space/stats.json`, updating lifetime counters,
 * peak concurrency, cumulative savings, and daily activity buckets.
 *
 * @param params - Repo root, current active linked count, savings captured at creation, and timestamp.
 */
export async function recordWorktreeCreated(params: {
  mainRoot: string;
  activeLinkedCount: number;
  diskSavedBytes: number;
  timeSavedMs: number;
  at?: Date;
}): Promise<void> {
  const at = params.at ?? new Date();
  const iso = at.toISOString();
  const key = path.resolve(params.mainRoot);
  await updateStatsStore((store) => {
    const repo = (store.repos[key] ??= emptyRepoLifetimeStats());
    repo.createdCount += 1;
    repo.peakConcurrentWorktrees = Math.max(repo.peakConcurrentWorktrees, params.activeLinkedCount);
    repo.cumulativeDiskSavedBytes += Math.max(0, params.diskSavedBytes);
    repo.cumulativeTimeSavedMs += Math.max(0, params.timeSavedMs);
    touchActivityWindow(repo, iso);
    repo.dailyActivity = upsertDailyBucket(repo.dailyActivity, toDateKey(at), {
      created: 1,
      diskSavedBytes: Math.max(0, params.diskSavedBytes),
      timeSavedMs: Math.max(0, params.timeSavedMs),
    });
  });
}

/**
 * Records a dependency isolation (breakaway) event in `~/.para-space/stats.json`.
 *
 * @param params - Repo root and optional event timestamp.
 */
export async function recordWorktreeIsolated(params: { mainRoot: string; at?: Date }): Promise<void> {
  const at = params.at ?? new Date();
  const iso = at.toISOString();
  const key = path.resolve(params.mainRoot);
  await updateStatsStore((store) => {
    const repo = (store.repos[key] ??= emptyRepoLifetimeStats());
    repo.isolatedCount += 1;
    touchActivityWindow(repo, iso);
    repo.dailyActivity = upsertDailyBucket(repo.dailyActivity, toDateKey(at), { isolated: 1 });
  });
}

/**
 * Measures shared dependency and `.git/objects` sizes for a newly created worktree and records
 * the creation event in `~/.para-space/stats.json` (D-055).
 *
 * @param params - `mainRoot`, `wtPath`, absolute `links` created, and current `activeLinkedCount`.
 *
 * @example
 * await recordWorktreeCreationSnapshot({ mainRoot, wtPath, links, activeLinkedCount: 2 });
 */
export async function recordWorktreeCreationSnapshot(params: {
  mainRoot: string;
  wtPath: string;
  links: string[];
  activeLinkedCount: number;
}): Promise<void> {
  const depPathSet = new Set(sharedPaths('dependencies'));
  const linkedDepRels = params.links.map((l) => path.relative(params.wtPath, l)).filter((rel) => depPathSet.has(rel));
  const sharedSizes = await measureRepoSharedSizes(params.mainRoot);
  let linkedDepsBytes = 0;
  for (const rel of linkedDepRels) linkedDepsBytes += sharedSizes.sharedDepsByRel.get(rel) ?? 0;
  const diskSavedBytes = linkedDepsBytes + sharedSizes.sharedGitBytes;
  const timeSavedMs = estimateTimeSavedMs({
    linkedDepRels,
    linkedDepsBytes,
    sharedGitBytes: sharedSizes.sharedGitBytes,
  });
  await recordWorktreeCreated({
    mainRoot: params.mainRoot,
    activeLinkedCount: params.activeLinkedCount,
    diskSavedBytes,
    timeSavedMs,
  });
}

/**
 * Records a worktree removal event in `~/.para-space/stats.json`.
 *
 * @param params - Repo root and optional event timestamp.
 *
 * @example
 * await recordWorktreeRemoved({ mainRoot: '/code/app' });
 */
export async function recordWorktreeRemoved(params: { mainRoot: string; at?: Date }): Promise<void> {
  const at = params.at ?? new Date();
  const iso = at.toISOString();
  const key = path.resolve(params.mainRoot);
  await updateStatsStore((store) => {
    const repo = (store.repos[key] ??= emptyRepoLifetimeStats());
    repo.removedCount += 1;
    touchActivityWindow(repo, iso);
    repo.dailyActivity = upsertDailyBucket(repo.dailyActivity, toDateKey(at), { removed: 1 });
  });
}
