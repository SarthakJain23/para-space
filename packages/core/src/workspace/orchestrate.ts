import fs from 'node:fs/promises';
import path from 'node:path';
import { colorForHex } from '../colors.js';
import { type CreateResult, createWorktree } from '../commands/create.js';
import { removeWorktree } from '../commands/remove.js';
import { branchExists } from '../git.js';
import { type Logger, type Prompter, silentLogger } from '../prompts.js';
import { type WorkspaceRecord, removeWorkspaceRecord, saveWorkspaceRecord } from '../workspaceState.js';
import {
  type CodeWorkspaceConfig,
  buildMultiRepoWorkspaceConfig,
  multiRepoWorkspaceFilePath,
  readWorkspaceConfigFile,
} from './config.js';

/** Branch plan for a single repository in a workspace batch. */
export interface WorkspaceBranchPlan {
  root: string;
  name?: string;
  branch: string;
  base?: string;
}

/** Options for provisioning worktrees across multiple repositories. */
export interface ProvisionBatchOptions {
  plans: WorkspaceBranchPlan[];
  requirement?: string;
  ide?: 'ask' | 'yes' | 'no';
  prompter?: Prompter;
  log?: Logger;
}

/** Options for writing a .code-workspace file and saving its WorkspaceRecord. */
export interface WriteWorkspaceOptions {
  results: CreateResult[];
  branch: string;
  existingWorkspaceFile?: string;
  workspaceName?: string;
}

/** Result of writing and persisting a multi-repository workspace. */
export interface WriteWorkspaceResult {
  workspaceFile: string;
  record: WorkspaceRecord;
  config: CodeWorkspaceConfig;
}

/** Options for cascading removal of a multi-repository workspace. */
export interface RemoveWorkspaceCascadeOptions {
  workspace: WorkspaceRecord;
  removeWorktrees?: boolean;
  deleteWorkspaceFile?: boolean;
  deleteBranch?: boolean;
  force?: boolean;
  log?: Logger;
}

/** Result of cascading removal of a multi-repository workspace. */
export interface RemoveWorkspaceCascadeResult {
  removedWorktrees: string[];
  errors: string[];
  workspaceFileDeleted: boolean;
}

async function rollbackBatch(results: CreateResult[], err: Error, log: Logger): Promise<never> {
  const failures: string[] = [];
  for (const prev of results) {
    try {
      const { mainRoot: cwd, path: target, createdBranch: deleteBranch } = prev;
      await removeWorktree({ cwd, target, force: true, deleteBranch, log });
    } catch (rollbackErr) {
      const msg = (rollbackErr as Error).message;
      failures.push(`${prev.path}: ${msg}`);
      log.warn(`Could not roll back worktree ${prev.path}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Worktree creation failed: ${err.message}. Rollback also failed: ${failures.join('; ')}`);
  }
  throw err;
}

/**
 * Sequentially provisions worktrees across `plans` and rolls back created worktrees if a later repo fails.
 * @param opts - Batch provisioning options (`plans`, `requirement`, `ide`, `prompter`, `log`).
 * @returns Array of `CreateResult` objects in plan order.
 * @example
 * const results = await provisionWorkspaceBatch({ plans: [{ root: '/code/api', branch: 'feat/x' }] });
 */
export async function provisionWorkspaceBatch(opts: ProvisionBatchOptions): Promise<CreateResult[]> {
  const { requirement, prompter, ide = 'yes', log = silentLogger } = opts;
  const results: CreateResult[] = [];
  for (const { root, branch, base: planBase } of opts.plans) {
    try {
      const hasBranch = await branchExists(root, branch);
      const base = !hasBranch && planBase && (await branchExists(root, planBase)) ? planBase : undefined;
      results.push(await createWorktree({ cwd: root, branch, base, requirement, prompter, ide, log }));
    } catch (err) {
      await rollbackBatch(results, err as Error, log);
    }
  }
  return results;
}

/**
 * Builds and writes a `.code-workspace` JSON file on disk and saves the `WorkspaceRecord` in state.
 * @param opts - Provisioned `results`, `branch`, optional `existingWorkspaceFile`, and `workspaceName`.
 * @returns The written `workspaceFile` path, saved `record`, and generated `config`.
 * @example
 * const { workspaceFile } = await writeAndSaveWorkspace({ results, branch: 'feat/x' });
 */
export async function writeAndSaveWorkspace(opts: WriteWorkspaceOptions): Promise<WriteWorkspaceResult> {
  const { results, branch, existingWorkspaceFile, workspaceName } = opts;
  const existingConfig = existingWorkspaceFile ? await readWorkspaceConfigFile(existingWorkspaceFile) : undefined;
  const hex = results.find((r) => r.color)?.color;
  const worktrees = results.map((r) => ({ mainRoot: r.mainRoot, worktreePath: r.path }));
  const config = buildMultiRepoWorkspaceConfig(worktrees, existingConfig, hex ? colorForHex(hex) : undefined);
  const paths = results.map((r) => r.path);
  const workspaceFile = multiRepoWorkspaceFilePath(paths, branch, existingWorkspaceFile, workspaceName);
  await fs.mkdir(path.dirname(workspaceFile), { recursive: true });
  await fs.writeFile(workspaceFile, JSON.stringify(config, null, 2), 'utf8');
  const repos = results.map((r) => ({ root: r.mainRoot, name: path.basename(r.mainRoot), worktreePath: r.path }));
  const name = path.basename(workspaceFile, '.code-workspace');
  const record: WorkspaceRecord = {
    id: workspaceFile,
    name,
    workspaceFile,
    branch,
    color: hex,
    repos,
    createdAt: new Date().toISOString(),
  };
  await saveWorkspaceRecord(record);
  return { workspaceFile, record, config };
}

/**
 * Case-insensitive substring matcher across candidate string values.
 * @param query - Optional search query string.
 * @param values - Candidate strings to test against `query`.
 * @returns True when `query` is blank or contained in any candidate value.
 * @example
 * matchesQuery('login', 'app-main', 'feat/login'); // → true
 */
export function matchesQuery(query: string | undefined, ...values: (string | undefined)[]): boolean {
  const search = query?.trim().toLowerCase();
  return !search || values.some((value) => value?.toLowerCase().includes(search));
}

/**
 * Filters workspace records by `name`, `branch`, `workspaceFile`, and repo `name`/`root`/`worktreePath`.
 * @param records - Array of `WorkspaceRecord` entries to filter.
 * @param query - Optional case-insensitive search query.
 * @returns Filtered array of `WorkspaceRecord` objects.
 * @example
 * const matched = filterWorkspaces(workspaces, 'feat/login');
 */
export function filterWorkspaces(records: WorkspaceRecord[], query?: string): WorkspaceRecord[] {
  if (!query?.trim()) return records;
  return records.filter((w) => {
    const repoFields = w.repos.flatMap((r) => [r.name, r.root, r.worktreePath]);
    return matchesQuery(query, w.name, w.branch, w.workspaceFile, ...repoFields);
  });
}

/**
 * Filters worktree rows by optional `repoName`, worktree `name`, `branch`, or `path`.
 * @param rows - Array of worktree row objects to filter.
 * @param query - Optional case-insensitive search query.
 * @param repoName - Optional repository name or path context included in matching.
 * @returns Filtered array of worktree rows.
 * @example
 * const rows = filterWorktreeRows(allRows, 'feat/x', 'frontend');
 */
export function filterWorktreeRows<T extends { name: string; branch?: string; path: string }>(
  rows: T[],
  query?: string,
  repoName?: string,
): T[] {
  return !query?.trim() ? rows : rows.filter((r) => matchesQuery(query, repoName, r.name, r.branch, r.path));
}

/**
 * Finds a workspace matching `target` by exact or substring match on `branch`, `name`, or resolved `workspaceFile` path.
 * @param records - Candidate `WorkspaceRecord` entries.
 * @param target - Branch name, workspace name, or `.code-workspace` file path.
 * @returns Matching `WorkspaceRecord`, or `undefined` if none matches.
 * @example
 * const ws = findMatchingWorkspace(records, 'feat/login');
 */
export function findMatchingWorkspace(records: WorkspaceRecord[], target: string): WorkspaceRecord | undefined {
  const trimmed = target.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const resolved = path.resolve(trimmed).toLowerCase();
  const isExact = (r: WorkspaceRecord) =>
    r.branch.toLowerCase() === lower ||
    r.name.toLowerCase() === lower ||
    path.basename(r.workspaceFile).toLowerCase() === lower ||
    r.workspaceFile.toLowerCase() === lower ||
    path.resolve(r.workspaceFile).toLowerCase() === resolved;
  return (
    records.find(isExact) ??
    records.find(
      (r) =>
        r.branch.toLowerCase().includes(lower) ||
        r.name.toLowerCase().includes(lower) ||
        r.workspaceFile.toLowerCase().includes(lower),
    )
  );
}

/**
 * Optionally removes all member worktrees of a `WorkspaceRecord`, removes the workspace record,
 * and optionally deletes the `.code-workspace` file from disk.
 * @param opts - Cascade options controlling worktree removal, branch deletion, and workspace file deletion.
 * @returns Summary of removed worktree paths, any per-repo errors, and whether the workspace file was deleted.
 * @example
 * const res = await removeWorkspaceCascade({ workspace: record, removeWorktrees: true, deleteWorkspaceFile: true });
 */
export async function removeWorkspaceCascade(
  opts: RemoveWorkspaceCascadeOptions,
): Promise<RemoveWorkspaceCascadeResult> {
  const { workspace, force, deleteBranch, log = silentLogger } = opts;
  const removeWorktrees = opts.removeWorktrees !== false;
  const removedWorktrees: string[] = [];
  const errors: string[] = [];
  if (removeWorktrees) {
    for (const { root: cwd, worktreePath: target, name } of [...workspace.repos]) {
      try {
        await removeWorktree({ cwd, target, force, deleteBranch, log });
        removedWorktrees.push(target);
      } catch (err) {
        errors.push(`${name}: ${(err as Error).message}`);
      }
    }
    if (errors.length > 0) {
      return { removedWorktrees, errors, workspaceFileDeleted: false };
    }
  }
  const workspaceFileDeleted = opts.deleteWorkspaceFile !== false;
  await removeWorkspaceRecord(workspace.workspaceFile, !workspaceFileDeleted);
  if (workspaceFileDeleted) await fs.rm(workspace.workspaceFile, { force: true });
  return { removedWorktrees, errors, workspaceFileDeleted };
}
