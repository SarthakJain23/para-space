import os from 'node:os';
import path from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { exists, readTextIfExists } from './util/fs.js';
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

export interface WorkspaceRepoEntry {
  root: string;
  name: string;
  worktreePath: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  workspaceFile: string;
  branch: string;
  color?: string;
  repos: WorkspaceRepoEntry[];
  createdAt: string;
}

export interface StateFile {
  version: 1;
  repos: Record<string, RepoState>;
  workspaces?: Record<string, WorkspaceRecord>;
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
    if (parsed && parsed.version === 1 && parsed.repos) {
      parsed.workspaces ??= {};
      return parsed;
    }
  } catch {
    // corrupt → start fresh
  }
  return { version: 1, repos: {}, workspaces: {} };
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
  fn: (workspaces: Record<string, WorkspaceRecord>) => T | Promise<T>,
): Promise<T> {
  await mkdir(stateDir(), { recursive: true });
  return withFileLock(stateLockPath(), async () => {
    const state = await readState();
    state.workspaces ??= {};
    const result = await fn(state.workspaces);
    await writeState(state);
    return result;
  });
}

/**
 * Saves or updates a multi-repo workspace record in `state.json`.
 *
 * @param record - The workspace record to persist.
 *
 * @example
 * await saveWorkspaceRecord({ id: wsFile, name: 'my-app', workspaceFile: wsFile, branch: 'feat/x', repos: [...] });
 */
export async function saveWorkspaceRecord(record: WorkspaceRecord): Promise<void> {
  await updateWorkspaceState((workspaces) => {
    const key = path.resolve(record.workspaceFile);
    workspaces[key] = {
      ...record,
      id: key,
      workspaceFile: key,
    };
  });
}

/**
 * Retrieves valid multi-repo workspace records, optionally filtering by participating repository roots.
 * Automatically prunes records whose .code-workspace file no longer exists on disk.
 *
 * @param forRepoRoots - Optional array of repository roots to filter by.
 * @returns Array of active WorkspaceRecord entries.
 *
 * @example
 * const workspaces = await getWorkspaceRecords(['/code/frontend', '/code/backend']);
 */
export async function getWorkspaceRecords(forRepoRoots?: string[]): Promise<WorkspaceRecord[]> {
  const state = await readState();
  const all = Object.values(state.workspaces ?? {});
  const valid: WorkspaceRecord[] = [];
  const missing: string[] = [];

  for (const ws of all) {
    if (await exists(ws.workspaceFile)) {
      if (forRepoRoots && forRepoRoots.length > 0) {
        const rootSet = new Set(forRepoRoots.map((r) => path.resolve(r)));
        const matches = ws.repos.some((r) => rootSet.has(path.resolve(r.root)));
        if (matches) valid.push(ws);
      } else {
        valid.push(ws);
      }
    } else {
      missing.push(ws.workspaceFile);
    }
  }

  if (missing.length > 0) {
    void updateWorkspaceState((workspaces) => {
      for (const m of missing) delete workspaces[path.resolve(m)];
    }).catch(() => {});
  }

  return valid;
}

/**
 * Finds a recorded multi-repo workspace that includes the given worktree path.
 *
 * @param worktreePath - Absolute path of a worktree.
 * @returns The matching WorkspaceRecord or undefined.
 *
 * @example
 * const ws = await findWorkspaceForWorktree('/code/frontend-feat-login');
 */
export async function findWorkspaceForWorktree(worktreePath: string): Promise<WorkspaceRecord | undefined> {
  const state = await readState();
  const target = path.resolve(worktreePath);
  for (const ws of Object.values(state.workspaces ?? {})) {
    if (ws.repos.some((r) => path.resolve(r.worktreePath) === target)) {
      if (await exists(ws.workspaceFile)) return ws;
    }
  }
  return undefined;
}

/**
 * Removes a multi-repo workspace record from `state.json`.
 *
 * @param workspaceFile - Absolute path to the .code-workspace file.
 *
 * @example
 * await removeWorkspaceRecord('/code/my-app.code-workspace');
 */
export async function removeWorkspaceRecord(workspaceFile: string): Promise<void> {
  await updateWorkspaceState((workspaces) => {
    delete workspaces[path.resolve(workspaceFile)];
  });
}
