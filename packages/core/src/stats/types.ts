import type { Logger } from '../prompts.js';
import type { DepsMode } from '../state.js';

export type StatsScope = 'repo' | 'global';

export interface DailyActivityBucket {
  /** Calendar date in `YYYY-MM-DD` (UTC). */
  date: string;
  created: number;
  isolated: number;
  removed: number;
  diskSavedBytes: number;
  timeSavedMs: number;
}

export interface LifetimeCounters {
  createdCount: number;
  isolatedCount: number;
  removedCount: number;
  peakConcurrentWorktrees: number;
  cumulativeDiskSavedBytes: number;
  cumulativeTimeSavedMs: number;
  firstActivityAt?: string;
  lastActivityAt?: string;
}

export interface RepoLifetimeStats extends LifetimeCounters {
  dailyActivity: DailyActivityBucket[];
}

export interface StatsStoreFile {
  version: 1;
  repos: Record<string, RepoLifetimeStats>;
}

export interface WorktreeStats {
  name: string;
  path: string;
  branch?: string;
  isMain: boolean;
  managed: boolean;
  depsMode: DepsMode;
  dirty: number;
  diverged: boolean;
  port?: number;
  color?: string;
  createdAt?: string;
  ageMs?: number;
  /** Actual on-disk size of this worktree directory (symlinks not followed). */
  diskUsageBytes: number;
  /** On-disk size of isolated dependency directories inside this worktree. */
  isolatedDepsBytes: number;
  /** Estimated disk space saved by this worktree vs. a full clone + fresh install. */
  diskSavedBytes: number;
}

export interface RepoStats {
  mainRoot: string;
  name: string;
  /** True when a previously tracked repository path no longer exists on disk. */
  missing: boolean;
  activeWorktrees: number;
  linkedWorktrees: number;
  managedWorktrees: number;
  symlinkedCount: number;
  isolatedCount: number;
  dirtyCount: number;
  divergedCount: number;
  portsAllocated: number[];
  sharedDepsSizeBytes: number;
  sharedGitSizeBytes: number;
  totalDiskUsageBytes: number;
  isolatedDepsBytes: number;
  liveDiskSavedBytes: number;
  liveTimeSavedMs: number;
  lifetime: LifetimeCounters;
  worktrees: WorktreeStats[];
}

export interface WorkspaceStatsItem {
  name: string;
  branch: string;
  workspaceFile: string;
  repoCount: number;
  color?: string;
}

export interface WorkspaceStatsSummary {
  totalWorkspaces: number;
  workspaces: WorkspaceStatsItem[];
}

export interface StatsSummary {
  totalRepos: number;
  activeRepos: number;
  activeWorktrees: number;
  linkedWorktrees: number;
  managedWorktrees: number;
  symlinkedCount: number;
  isolatedCount: number;
  dirtyCount: number;
  divergedCount: number;
  portsAllocated: number;
  totalWorkspaces: number;
  totalDiskUsageBytes: number;
  isolatedDepsBytes: number;
  liveDiskSavedBytes: number;
  liveTimeSavedMs: number;
}

export interface ParaSpaceStats {
  scope: StatsScope;
  generatedAt: string;
  diskMeasured: boolean;
  summary: StatsSummary;
  lifetime: LifetimeCounters;
  activitySeries: DailyActivityBucket[];
  repos: RepoStats[];
  workspaces: WorkspaceStatsSummary;
}

export interface StatsOptions {
  /** Directory inside a repo, multi-repo container, or any folder (for global scope). */
  cwd: string;
  /** `'repo'` (default) scopes to current repo/workspace; `'global'` aggregates all tracked repos. */
  scope?: StatsScope;
  /** Measure actual disk usage and exact symlink savings (default `true`). Set `false` for instant counts. */
  includeDiskUsage?: boolean;
  /** Explicit repository roots to include when `scope` is `'repo'` (e.g. VS Code multi-root workspace). */
  repoRoots?: string[];
  log?: Logger;
}
