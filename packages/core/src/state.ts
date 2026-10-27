import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { paraSpaceHome, workspacesDir } from './paths.js';
import { readTextIfExists } from './util/fs.js';
import { withFileLock } from './util/lock.js';
import type { WorkspaceRecord } from './workspaceState.js';

export {
  type WorkspaceRepoEntry,
  type WorkspaceRecord,
  saveWorkspaceRecord,
  getWorkspaceRecords,
  findWorkspaceForWorktree,
  removeWorkspaceRecord,
} from './workspaceState.js';

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
  workspaces?: Record<string, WorkspaceRecord>;
  ignoredWorkspaces?: string[];
}

/**
 * Returns the directory where ParaSpace stores its machine-wide state file (overridable via `PARA_SPACE_HOME`).
 *
 * @returns Absolute path to the state directory.
 *
 * @example
 * const dir = stateDir(); // → '/Users/you/.para-space'
 */
export function stateDir(): string {
  return paraSpaceHome();
}

/**
 * Returns the machine-wide state file path (`~/.para-space/state.json`, or under `PARA_SPACE_HOME`) (D-010).
 *
 * @returns Absolute path to `state.json`.
 *
 * @example
 * const file = statePath(); // → '/Users/you/.para-space/state.json'
 */
export function statePath(): string {
  return path.join(stateDir(), 'state.json');
}

/**
 * Reads and parses the ParaSpace state file, returning an initialized default state if missing or corrupt.
 *
 * @returns Parsed `StateFile` object.
 *
 * @example
 * const state = await readState();
 */
export async function readState(): Promise<StateFile> {
  const text = await readTextIfExists(statePath());
  try {
    const parsed = text && (JSON.parse(text) as StateFile);
    if (parsed && parsed.version === 1 && parsed.repos) {
      parsed.workspaces ??= {};
      parsed.ignoredWorkspaces ??= [];
      return parsed;
    }
  } catch {
    // corrupt → start fresh
  }
  return { version: 1, repos: {}, workspaces: {}, ignoredWorkspaces: [] };
}

/**
 * Atomically writes the state file via a temporary file and rename.
 *
 * @param state - Complete `StateFile` object to write.
 * @returns Promise that resolves once `state.json` is updated.
 *
 * @example
 * await writeState(state);
 */
export async function writeState(state: StateFile): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  await mkdir(workspacesDir(), { recursive: true });
  const tmp = `${statePath()}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, statePath());
}

/**
 * Returns the path to the lock file guarding `state.json` transactions.
 *
 * @returns Absolute path to `state.lock`.
 *
 * @example
 * const lock = stateLockPath();
 */
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

/**
 * Reads the persisted worktree state for a repository root.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @returns `RepoState` containing recorded worktrees for that repository.
 *
 * @example
 * const { worktrees } = await getRepoState('/code/app');
 */
export async function getRepoState(mainRoot: string): Promise<RepoState> {
  const state = await readState();
  return state.repos[path.resolve(mainRoot)] ?? { worktrees: [] };
}

/**
 * Computes the lowest worktree index ≥ 1 not used by any existing record (0 is reserved for the main repo).
 *
 * @param records - Existing worktree records for a repository.
 * @returns Lowest available positive integer index.
 *
 * @example
 * const idx = nextWorktreeIndex(records); // → 1
 */
export function nextWorktreeIndex(records: WorktreeRecord[]): number {
  const used = new Set(records.map((r) => r.index));
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

/**
 * Read-modify-write multi-repo workspace entries in `state.json`, as a single transaction under `state.lock`.
 *
 * @param fn - Mutates `workspaces`; may be async.
 * @returns Whatever `fn` returns.
 *
 * @example
 * await updateWorkspaceState((workspaces) => {
 *   delete workspaces['/code/my-app.code-workspace'];
 * });
 */
export async function updateWorkspaceState<T>(
  fn: (workspaces: Record<string, WorkspaceRecord>, ignoredWorkspaces: string[]) => T | Promise<T>,
): Promise<T> {
  await mkdir(stateDir(), { recursive: true });
  return withFileLock(stateLockPath(), async () => {
    const state = await readState();
    state.workspaces ??= {};
    state.ignoredWorkspaces ??= [];
    const result = await fn(state.workspaces, state.ignoredWorkspaces);
    await writeState(state);
    return result;
  });
}
