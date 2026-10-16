import os from 'node:os';
import path from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

export type DepsMode = 'Source' | 'Symlinked' | 'Isolated' | 'None';

export interface WorktreeRecord {
  branch: string;
  path: string;
  index: number;
  port?: number;
  color?: string;
  /** Paths (absolute) of links ParallelTree created inside the worktree. */
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

/** Overridable for tests via PARALLELTREE_HOME. */
export function stateDir(): string {
  return path.resolve(process.env.PARALLELTREE_HOME ?? path.join(os.homedir(), '.paralleltree'));
}

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

/** Read-modify-write helper for one repo's state. */
export async function updateRepoState<T>(mainRoot: string, fn: (repo: RepoState) => T): Promise<T> {
  const state = await readState();
  const key = path.resolve(mainRoot);
  const repo = (state.repos[key] ??= { worktrees: [] });
  const result = fn(repo);
  await writeState(state);
  return result;
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
