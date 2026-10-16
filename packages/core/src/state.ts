import os from 'node:os';
import path from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';
import { withFileLock } from './util/lock.js';

export type DepsMode = 'Source' | 'Symlinked' | 'Isolated' | 'None';

export interface WorktreeRecord {
  branch: string;
  path: string;
  index: number;
  port?: number;
  color?: string;
  /** Paths (absolute) of links ParaSpace created inside the worktree. */
  links: string[];
  isolated: boolean;
  createdAt: string;
}

export interface RepoState {
  worktrees: WorktreeRecord[];
}

export interface StateFile {
  version: 1;
  repos: Record<string, RepoState>;
}

/** Overridable for tests via PARA_SPACE_HOME. */
export function stateDir(): string {
  return path.resolve(process.env.PARA_SPACE_HOME ?? path.join(os.homedir(), '.para-space'));
}

/** Machine-wide state file: `~/.para-space/state.json`, or under `PARA_SPACE_HOME` (D-010). */
export function statePath(): string {
  return path.join(stateDir(), 'state.json');
}

export async function readState(): Promise<StateFile> {
  const text = await readTextIfExists(statePath());
  try {
    const parsed = text && (JSON.parse(text) as StateFile);
    if (parsed && parsed.version === 1 && parsed.repos) return parsed;
  } catch {
    // corrupt → start fresh
  }
  return { version: 1, repos: {} };
}

/** Atomic write: write a temp file, then rename over the original. */
export async function writeState(state: StateFile): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  const tmp = `${statePath()}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, statePath());
}

export function stateLockPath(): string {
  return path.join(stateDir(), 'state.lock');
}

/**
 * Read-modify-write one repo's entry in `state.json`, as a single transaction.
 *
 * Holds `state.lock` for the whole cycle so concurrent `para` runs (CLI, extension, agents)
 * never lose each other's updates (D-027). Mutate `repo` in place inside `fn`; the whole file
 * is written back atomically afterwards. Every state write must go through this function.
 *
 * @param mainRoot - Main repository root (the key in `state.json`).
 * @param fn - Mutates `repo`; may be async. Must not call `updateRepoState` itself (not re-entrant).
 * @returns Whatever `fn` returns.
 *
 * @example
 * await updateRepoState(mainRoot, (repo) => {
 *   repo.worktrees = repo.worktrees.filter((w) => w.path !== removedPath);
 * });
 */
export async function updateRepoState<T>(mainRoot: string, fn: (repo: RepoState) => T | Promise<T>): Promise<T> {
  await mkdir(stateDir(), { recursive: true });
  return withFileLock(stateLockPath(), async () => {
    const state = await readState();
    const key = path.resolve(mainRoot);
    const repo = (state.repos[key] ??= { worktrees: [] });
    const result = await fn(repo);
    await writeState(state);
    return result;
  });
}

export async function getRepoState(mainRoot: string): Promise<RepoState> {
  const state = await readState();
  return state.repos[path.resolve(mainRoot)] ?? { worktrees: [] };
}

/** Lowest worktree index ≥ 1 not used by any record (0 is the main repo). */
export function nextWorktreeIndex(records: WorktreeRecord[]): number {
  const used = new Set(records.map((r) => r.index));
  let i = 1;
  while (used.has(i)) i++;
  return i;
}
