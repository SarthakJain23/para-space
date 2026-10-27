import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { workspacesDir } from './paths.js';
import { readState, updateWorkspaceState } from './state.js';
import { exists } from './util/fs.js';
import { findAllWorkspaceConfigFiles } from './workspace/config.js';
import { parseWorkspaceFileAsRecord } from './workspace/discovery.js';

/** Repository entry within a recorded multi-repository workspace. */
export interface WorkspaceRepoEntry {
  root: string;
  name: string;
  worktreePath: string;
}

/** Recorded multi-repository workspace persisted in `state.json`. */
export interface WorkspaceRecord {
  id: string;
  name: string;
  workspaceFile: string;
  branch: string;
  color?: string;
  repos: WorkspaceRepoEntry[];
  createdAt: string;
}

/**
 * Saves or updates a multi-repo workspace record in `state.json`.
 *
 * @param record - The workspace record to persist.
 * @returns Promise that resolves once the record is persisted.
 *
 * @example
 * await saveWorkspaceRecord({ id: wsFile, name: 'my-app', workspaceFile: wsFile, branch: 'feat/x', repos: [], createdAt: '' });
 */
export async function saveWorkspaceRecord(record: WorkspaceRecord): Promise<void> {
  await mkdir(workspacesDir(), { recursive: true });
  await mkdir(path.dirname(path.resolve(record.workspaceFile)), { recursive: true });
  await updateWorkspaceState((workspaces, ignoredWorkspaces) => {
    const key = path.resolve(record.workspaceFile);
    const ignoredIndex = ignoredWorkspaces.indexOf(key);
    if (ignoredIndex >= 0) ignoredWorkspaces.splice(ignoredIndex, 1);
    workspaces[key] = {
      ...record,
      id: key,
      workspaceFile: key,
    };
  });
}

/**
 * Retrieves valid multi-repo workspace records, optionally filtering by participating repository roots.
 * Automatically discovers any existing .code-workspace files in candidate project directories,
 * and prunes records whose .code-workspace file no longer exists on disk.
 *
 * @param forRepoRoots - Optional array of repository roots to filter by.
 * @returns Array of active WorkspaceRecord entries.
 *
 * @example
 * const workspaces = await getWorkspaceRecords(['/code/frontend', '/code/backend']);
 */
export async function getWorkspaceRecords(forRepoRoots?: string[]): Promise<WorkspaceRecord[]> {
  const state = await readState();
  const ignoredWorkspaces = new Set((state.ignoredWorkspaces ?? []).map((file) => path.resolve(file)));

  const knownWorktreeColors: Record<string, string> = {};
  for (const repo of Object.values(state.repos)) {
    for (const wt of repo.worktrees) {
      if (wt.color) {
        knownWorktreeColors[path.resolve(wt.path)] = wt.color;
      }
    }
  }

  const candidateDirs = new Set<string>([workspacesDir()]);
  try {
    const cwd = process.cwd();
    if (cwd) {
      candidateDirs.add(path.resolve(cwd));
      candidateDirs.add(path.dirname(path.resolve(cwd)));
    }
  } catch {
    // ignore
  }

  for (const [repoRoot, repo] of Object.entries(state.repos)) {
    candidateDirs.add(path.resolve(repoRoot));
    candidateDirs.add(path.dirname(path.resolve(repoRoot)));
    for (const wt of repo.worktrees) {
      candidateDirs.add(path.dirname(path.resolve(wt.path)));
    }
  }

  if (forRepoRoots) {
    for (const r of forRepoRoots) {
      candidateDirs.add(path.resolve(r));
      candidateDirs.add(path.dirname(path.resolve(r)));
    }
  }

  const discovered: WorkspaceRecord[] = [];
  state.workspaces ??= {};

  for (const dir of candidateDirs) {
    const wsFiles = await findAllWorkspaceConfigFiles(dir);
    for (const file of wsFiles) {
      const key = path.resolve(file);
      if (ignoredWorkspaces.has(key)) continue;
      if (!state.workspaces[key]) {
        const record = await parseWorkspaceFileAsRecord(key, knownWorktreeColors);
        if (record) {
          state.workspaces[key] = record;
          discovered.push(record);
        }
      }
    }
  }

  const all = Object.values(state.workspaces);
  const valid: WorkspaceRecord[] = [];
  const missing: string[] = [];
  const updated: WorkspaceRecord[] = [];

  for (const ws of all) {
    if (await exists(ws.workspaceFile)) {
      const liveRepos: WorkspaceRepoEntry[] = [];
      for (const r of ws.repos) {
        if (await exists(r.worktreePath)) {
          liveRepos.push(r);
        }
      }
      if (liveRepos.length === 0) {
        missing.push(ws.workspaceFile);
        continue;
      }
      if (liveRepos.length !== ws.repos.length) {
        ws.repos = liveRepos;
        updated.push(ws);
      }
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

  if (discovered.length > 0 || missing.length > 0 || updated.length > 0) {
    await updateWorkspaceState((workspaces, ignored) => {
      const ignoredSet = new Set(ignored.map((f) => path.resolve(f)));
      for (const d of discovered) {
        const key = path.resolve(d.workspaceFile);
        if (!ignoredSet.has(key) && !workspaces[key]) workspaces[key] = d;
      }
      for (const u of updated) {
        workspaces[path.resolve(u.workspaceFile)] = u;
      }
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
  const target = path.resolve(worktreePath);
  const workspaces = await getWorkspaceRecords();
  for (const ws of workspaces) {
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
 * @param keepFile - Whether to suppress automatic discovery while leaving the file on disk.
 * @returns Promise that resolves once the workspace record is removed.
 *
 * @example
 * await removeWorkspaceRecord('/code/my-app.code-workspace');
 */
export async function removeWorkspaceRecord(workspaceFile: string, keepFile = true): Promise<void> {
  await updateWorkspaceState((workspaces, ignoredWorkspaces) => {
    const key = path.resolve(workspaceFile);
    delete workspaces[key];
    const ignoredIndex = ignoredWorkspaces.indexOf(key);
    if (keepFile && ignoredIndex < 0) ignoredWorkspaces.push(key);
    if (!keepFile && ignoredIndex >= 0) ignoredWorkspaces.splice(ignoredIndex, 1);
  });
}
