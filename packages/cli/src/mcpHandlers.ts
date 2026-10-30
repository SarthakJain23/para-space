import {
  type WorkspaceRecord,
  addReposToWorkspace,
  createWorktree,
  discoverWorkspaceRepoRoots,
  exists,
  filterWorktreeRows,
  findWorkspaceForWorktree,
  getWorkspaceRecords,
  isolateWorktree,
  listWorktrees,
  parseWorkspaceFileAsRecord,
  removeWorkspaceCascade,
  removeWorktree,
  resolveRepoInput,
} from '@para-space/core';
import path from 'node:path';
import {
  filterWorkspaceRecords,
  matchWorkspaceRecord,
  openWithCode,
  provisionCliWorktrees,
  writeMultiRepoWorkspace,
} from './commands/workspaceActions.js';
import { log } from './runtime.js';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

async function findTargetWorkspaceForMcp(baseDir: string, target?: string): Promise<WorkspaceRecord | undefined> {
  const roots = await discoverWorkspaceRepoRoots(baseDir);
  const scoped = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
  const all = scoped.length > 0 ? scoped : await getWorkspaceRecords();

  if (target) {
    const matched =
      matchWorkspaceRecord(scoped, target) ??
      matchWorkspaceRecord(all, target) ??
      (all !== scoped ? matchWorkspaceRecord(await getWorkspaceRecords(), target) : undefined);
    if (matched) return matched;
    const resolvedTarget = path.resolve(baseDir, target);
    if (target.endsWith('.code-workspace') && (await exists(resolvedTarget))) {
      return parseWorkspaceFileAsRecord(resolvedTarget);
    }
    return undefined;
  }

  const current = await findWorkspaceForWorktree(baseDir);
  if (current) return current;
  if (scoped.length === 1) return scoped[0];
  if (all.length === 1) return all[0];
  return undefined;
}

/** Handles `para_create_workspace` MCP tool invocations. */
export async function handleCreateWorkspace(args: {
  branch: string;
  base?: string;
  requirement?: string;
  repos?: string[];
  cwd?: string;
}) {
  const { branch, base, requirement, repos, cwd } = args;
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  const existingWs = await findTargetWorkspaceForMcp(baseDir, branch);

  let targetRoots: string[];
  try {
    targetRoots =
      repos && repos.length > 0
        ? Array.from(new Set(await Promise.all(repos.map((r) => resolveRepoInput(r, baseDir, existingWs)))))
        : await discoverWorkspaceRepoRoots(baseDir);
  } catch (err) {
    return errorResult(`Error resolving repositories: ${(err as Error).message}`);
  }

  if (targetRoots.length === 0) return errorResult(`Error: No Git repositories found in ${baseDir}.`);

  // If a multi-repo workspace already exists for this exact branch and the caller passed additional repo(s),
  // extend the existing workspace rather than creating a disconnected standalone worktree.
  if (existingWs && existingWs.branch === branch && repos && repos.length > 0) {
    const newOnly = targetRoots.filter(
      (root) => !existingWs.repos.some((r) => path.resolve(r.root) === path.resolve(root)),
    );
    if (newOnly.length > 0 && targetRoots.length < existingWs.repos.length + newOnly.length) {
      return handleAddRepoToWorkspace({
        target: existingWs.workspaceFile,
        repos,
        branch,
        base,
        requirement,
        cwd: baseDir,
      });
    }
  }

  if (targetRoots.length === 1) {
    try {
      const res = await createWorktree({ cwd: targetRoots[0], branch, base, requirement, ide: 'yes', log });
      await openWithCode(res.path);
      return jsonResult({
        message: `Worktree ready for ${branch}`,
        worktreePath: res.path,
        port: res.port,
        branch: res.branch,
        color: res.color,
      });
    } catch (err) {
      return errorResult(`Error creating worktree: ${(err as Error).message}`);
    }
  }

  try {
    const plans = targetRoots.map((root) => ({ repo: { root, name: path.basename(root) }, branch, base }));
    const results = await provisionCliWorktrees(plans, requirement, 'yes', false);
    const workspaceFilePath = await writeMultiRepoWorkspace(results, branch, baseDir);
    await openWithCode(workspaceFilePath);
    return jsonResult({
      message: `Multi-repository workspace ready for ${branch}`,
      workspaceFile: workspaceFilePath,
      worktrees: results.map((r) => ({
        repo: path.basename(r.mainRoot),
        path: r.path,
        port: r.port,
        branch: r.branch,
      })),
    });
  } catch (err) {
    return errorResult(`Error creating multi-repo workspace: ${(err as Error).message}`);
  }
}

/** Handles `para_add_repo_to_workspace` MCP tool invocations. */
export async function handleAddRepoToWorkspace(args: {
  repos: string[];
  target?: string;
  branch?: string;
  base?: string;
  requirement?: string;
  cwd?: string;
}) {
  const { repos, target, branch, base, requirement, cwd } = args;
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();

  if (!repos || repos.length === 0) {
    return errorResult('Error: At least one repository must be specified in "repos".');
  }

  const workspace = await findTargetWorkspaceForMcp(baseDir, target ?? branch);
  if (!workspace) {
    return errorResult(
      target
        ? `Error: No multi-repository workspace found matching "${target}".`
        : 'Error: Could not determine target multi-repository workspace. Specify "target" (branch, workspace name, or .code-workspace path).',
    );
  }

  let resolvedRoots: string[];
  try {
    resolvedRoots = Array.from(new Set(await Promise.all(repos.map((r) => resolveRepoInput(r, baseDir, workspace)))));
  } catch (err) {
    return errorResult(`Error resolving repository: ${(err as Error).message}`);
  }

  try {
    const targetBranch = branch || workspace.branch;
    const plans = resolvedRoots.map((root) => ({
      root,
      name: path.basename(root),
      branch: targetBranch,
      base,
    }));

    const res = await addReposToWorkspace({
      workspace,
      plans,
      requirement,
      ide: 'yes',
      log,
    });

    await openWithCode(res.workspaceFile);
    return jsonResult({
      message: `Added ${res.added.length} repository(s) to workspace ${res.record.name}`,
      workspaceFile: res.workspaceFile,
      branch: res.record.branch,
      added: res.added.map((r) => ({
        repo: path.basename(r.mainRoot),
        path: r.path,
        port: r.port,
        branch: r.branch,
      })),
      skipped: res.skipped,
      repos: res.record.repos.map((r) => ({
        repo: r.name,
        root: r.root,
        worktreePath: r.worktreePath,
      })),
    });
  } catch (err) {
    return errorResult(`Error adding repository to workspace: ${(err as Error).message}`);
  }
}

/** Handles `para_open_workspace` MCP tool invocations. */
export async function handleOpenWorkspace({ target, cwd }: { target: string; cwd?: string }) {
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  const resolvedTarget = path.resolve(baseDir, target);
  const roots = await discoverWorkspaceRepoRoots(baseDir);
  const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
  const lower = target.toLowerCase();

  const match =
    matchWorkspaceRecord(records, target) ??
    (roots.length > 0 ? matchWorkspaceRecord(await getWorkspaceRecords(), target) : undefined);
  if (match) {
    await openWithCode(match.workspaceFile);
    return textResult(`Opened workspace ${match.name} (${match.workspaceFile}) in VS Code.`);
  }

  if (target.endsWith('.code-workspace') && (await exists(resolvedTarget))) {
    await openWithCode(resolvedTarget);
    return textResult(`Opened workspace file ${resolvedTarget} in VS Code.`);
  }

  for (const root of roots) {
    try {
      const rows = await listWorktrees({ cwd: root });
      const rowMatch = rows.find(
        (r) =>
          r.branch?.toLowerCase() === lower ||
          r.name.toLowerCase() === lower ||
          path.resolve(r.path).toLowerCase() === resolvedTarget.toLowerCase(),
      );
      if (rowMatch) {
        await openWithCode(rowMatch.path);
        return textResult(`Opened worktree ${rowMatch.name} (${rowMatch.path}) in VS Code.`);
      }
    } catch {
      // ignore
    }
  }

  return errorResult(`Error: No workspace or worktree found matching "${target}".`);
}

/** Handles `para_list_worktrees` MCP tool invocations. */
export async function handleListWorktrees({ cwd, query }: { cwd?: string; query?: string }) {
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  const roots = await discoverWorkspaceRepoRoots(baseDir);
  const workspaces = filterWorkspaceRecords(await getWorkspaceRecords(roots.length > 0 ? roots : undefined), query);

  const repoWorktrees: Record<string, unknown> = {};
  for (const root of roots) {
    try {
      const repoName = path.basename(root);
      const rows = filterWorktreeRows(await listWorktrees({ cwd: root }), query, repoName);
      repoWorktrees[repoName] = rows.map((r) => ({
        name: r.name,
        branch: r.branch,
        path: r.path,
        port: r.port,
        status: r.dirty ? `${r.dirty} uncommitted` : 'clean',
        depsMode: r.depsMode,
        diverged: r.diverged,
      }));
    } catch (err) {
      repoWorktrees[path.basename(root)] = { error: (err as Error).message };
    }
  }

  return jsonResult({
    workspaces: workspaces.map((w) => ({
      name: w.name,
      branch: w.branch,
      file: w.workspaceFile,
      repos: w.repos.map((r) => r.name),
    })),
    repositories: repoWorktrees,
  });
}

/** Handles `para_isolate_worktree` MCP tool invocations. */
export async function handleIsolateWorktree(args: { target: string; reason?: string; cwd?: string }) {
  const { target, reason, cwd } = args;
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  try {
    const res = await isolateWorktree({ cwd: baseDir, target, reason, log });
    return jsonResult({
      message: `Dependencies isolated for ${target}`,
      worktreePath: res.path,
      strategies: res.isolated,
    });
  } catch (err) {
    return errorResult(`Error isolating worktree: ${(err as Error).message}`);
  }
}

/** Handles `para_remove_workspace` MCP tool invocations. */
export async function handleRemoveWorkspace(args: {
  target: string;
  deleteBranch?: boolean;
  deleteWorkspaceFile?: boolean;
  removeWorktrees?: boolean;
  force?: boolean;
  cwd?: string;
}) {
  const { target, deleteBranch, deleteWorkspaceFile, removeWorktrees, force, cwd } = args;
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  const roots = await discoverWorkspaceRepoRoots(baseDir);
  const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
  const match =
    matchWorkspaceRecord(records, target) ??
    (roots.length > 0 ? matchWorkspaceRecord(await getWorkspaceRecords(), target) : undefined);

  if (match) {
    const { removedWorktrees, errors, workspaceFileDeleted } = await removeWorkspaceCascade({
      workspace: match,
      removeWorktrees,
      deleteWorkspaceFile,
      deleteBranch,
      force,
      log,
    });

    return jsonResult({
      removedWorkspace: match.name,
      workspaceFile: match.workspaceFile,
      workspaceFileDeleted,
      removedWorktrees,
      ...(errors.length > 0 ? { errors } : {}),
    });
  }

  try {
    const res = await removeWorktree({ cwd: baseDir, target, force, deleteBranch, log });
    return jsonResult({ removedWorktree: res.path, branch: res.branch, branchDeleted: res.branchDeleted });
  } catch (err) {
    return errorResult(`Error removing worktree: ${(err as Error).message}`);
  }
}
