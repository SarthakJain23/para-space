import path from 'node:path';
import {
  exists,
  filterWorkspaces,
  filterWorktreeRows,
  findMatchingWorkspace,
  getWorkspaceRecords,
  isolateWorktree,
  removeWorkspaceCascade,
  removeWorktree,
} from '@para-space/core';
import * as vscode from 'vscode';
import type { CommandContext } from './commands/context.js';
import { requireActiveRepoRoot } from './workspace.js';

interface ToolResultPart {
  type: string;
  value: string;
}

export function makeToolResult(text: string): unknown {
  const lm = vscode as unknown as {
    LanguageModelToolResult?: new (parts: unknown[]) => unknown;
    LanguageModelTextPart?: new (text: string) => unknown;
  };
  if (typeof lm.LanguageModelToolResult === 'function' && typeof lm.LanguageModelTextPart === 'function') {
    return new lm.LanguageModelToolResult([new lm.LanguageModelTextPart(text)]);
  }
  return { content: [{ type: 'text', value: text }] as ToolResultPart[] };
}

/** Handles `para_create_workspace` Language Model Tool invocation. */
export async function invokeCreateWorkspace(input: {
  branch: string;
  requirement?: string;
  base?: string;
  repos?: string[];
}): Promise<unknown> {
  const { branch, requirement, base, repos } = input;
  try {
    await vscode.commands.executeCommand('paraSpace.createWorktree', {
      branch,
      requirement,
      base,
      repos,
      ide: 'yes',
    });
    return makeToolResult(
      `Successfully provisioned parallel workspace/worktree for branch "${branch}". The window has been opened.`,
    );
  } catch (err) {
    return makeToolResult(`Failed to create workspace: ${(err as Error).message}`);
  }
}

/** Handles `para_add_repo_to_workspace` Language Model Tool invocation. */
export async function invokeAddRepoToWorkspace(input: {
  repos: string[];
  target?: string;
  branch?: string;
  base?: string;
  requirement?: string;
}): Promise<unknown> {
  const { repos, target, branch, base, requirement } = input;
  try {
    await vscode.commands.executeCommand('paraSpace.addRepoToWorkspace', {
      repos,
      target,
      branch,
      base,
      requirement,
      ide: 'yes',
    });
    return makeToolResult(
      `Successfully added ${repos.join(', ')} to the parallel workspace${target ? ` "${target}"` : ''}.`,
    );
  } catch (err) {
    return makeToolResult(`Failed to add repository to workspace: ${(err as Error).message}`);
  }
}

/** Handles `para_open_workspace` Language Model Tool invocation. */
export async function invokeOpenWorkspace({ store }: CommandContext, input: { target: string }): Promise<unknown> {
  const { target } = input;
  try {
    await store.load();
    const lower = target.toLowerCase();
    const wsMatch =
      findMatchingWorkspace(store.workspaces, target) ?? findMatchingWorkspace(await getWorkspaceRecords(), target);
    const wtMatch = store.allRows.find(
      (r) =>
        r.path === target ||
        path.resolve(r.path).toLowerCase() === path.resolve(target).toLowerCase() ||
        r.name.toLowerCase() === lower ||
        r.branch?.toLowerCase() === lower,
    );
    const diskMatch = !wsMatch && !wtMatch && (await exists(path.resolve(target))) ? path.resolve(target) : undefined;
    const resolvedTarget = wsMatch?.workspaceFile ?? wtMatch?.path ?? diskMatch;
    if (!resolvedTarget) {
      throw new Error(`No workspace or worktree found matching "${target}".`);
    }
    await vscode.commands.executeCommand('paraSpace.openWorkspace', resolvedTarget);
    return makeToolResult(`Opened workspace matching "${target}" in VS Code.`);
  } catch (err) {
    return makeToolResult(`Failed to open workspace: ${(err as Error).message}`);
  }
}

/** Handles `para_list_worktrees` Language Model Tool invocation. */
export async function invokeListWorktrees({ store }: CommandContext, input?: { query?: string }): Promise<unknown> {
  try {
    await store.load();
    const query = input?.query?.trim();
    const lines: string[] = ['# ParaSpace Worktrees & Workspaces', ''];
    const workspaces = filterWorkspaces(store.workspaces, query);

    if (workspaces.length > 0) {
      lines.push('## Multi-Repository Workspaces:');
      for (const ws of workspaces) {
        const repos = ws.repos.map((r) => r.name).join(', ');
        lines.push(`- **${ws.branch}** (${ws.repos.length} repos: ${repos}) → \`${ws.workspaceFile}\``);
      }
      lines.push('');
    }

    lines.push('## Active Repositories & Worktrees:');
    for (const repo of store.repos) {
      const rows = filterWorktreeRows(repo.rows, query, `${repo.name} ${repo.root}`);
      if (query && rows.length === 0) continue;
      lines.push(`### ${repo.name} (\`${repo.root}\`)`);
      if (rows.length === 0) {
        lines.push('  *(no worktrees)*');
      } else {
        for (const r of rows) {
          const port = r.port !== undefined ? `:${r.port}` : 'no port';
          const status = r.dirty ? `${r.dirty} uncommitted` : 'clean';
          const mainTag = r.isMain ? ' (main)' : '';
          lines.push(`  - **${r.branch ?? r.name}**${mainTag}: ${status} · ${port} · ${r.depsMode} → \`${r.path}\``);
        }
      }
    }

    return makeToolResult(lines.join('\n'));
  } catch (err) {
    return makeToolResult(`Error listing worktrees: ${(err as Error).message}`);
  }
}

/** Handles `para_isolate_worktree` Language Model Tool invocation. */
export async function invokeIsolateWorktree(
  { rt, store }: CommandContext,
  input: { target: string; reason?: string },
): Promise<unknown> {
  const { target, reason } = input;
  try {
    await store.load();
    const lower = target.toLowerCase();
    const matchingRepos = store.repos.filter((repo) =>
      repo.rows.some(
        (r) =>
          !r.isMain &&
          (r.path === target ||
            path.resolve(r.path) === path.resolve(target) ||
            r.name.toLowerCase() === lower ||
            r.branch?.toLowerCase() === lower),
      ),
    );
    const symlinkedMatch = matchingRepos.find((repo) =>
      repo.rows.some(
        (r) =>
          !r.isMain &&
          r.depsMode === 'Symlinked' &&
          (r.path === target ||
            path.resolve(r.path) === path.resolve(target) ||
            r.name.toLowerCase() === lower ||
            r.branch?.toLowerCase() === lower),
      ),
    );
    const root = symlinkedMatch?.root ?? matchingRepos[0]?.root ?? requireActiveRepoRoot(store.roots);
    const res = await isolateWorktree({
      cwd: root,
      target,
      reason,
      log: rt.log,
    });
    void store.load();
    return makeToolResult(
      `Successfully isolated dependencies for worktree "${target}" at ${res.path}. Strategies applied: ${res.isolated.join(', ')}.`,
    );
  } catch (err) {
    return makeToolResult(`Failed to isolate worktree: ${(err as Error).message}`);
  }
}

/** Handles `para_remove_workspace` Language Model Tool invocation. */
export async function invokeRemoveWorkspace(
  { rt, store }: CommandContext,
  input: {
    target: string;
    deleteBranch?: boolean;
    deleteWorkspaceFile?: boolean;
    removeWorktrees?: boolean;
    force?: boolean;
  },
): Promise<unknown> {
  const { target, deleteBranch = false, deleteWorkspaceFile = true, removeWorktrees = true, force = false } = input;
  try {
    await store.load();
    const lower = target.toLowerCase();
    const matchedWorkspace =
      findMatchingWorkspace(store.workspaces, target) ?? findMatchingWorkspace(await getWorkspaceRecords(), target);

    const summary: string[] = [];

    if (matchedWorkspace) {
      const { removedWorktrees, errors, workspaceFileDeleted } = await removeWorkspaceCascade({
        workspace: matchedWorkspace,
        removeWorktrees,
        deleteWorkspaceFile,
        deleteBranch,
        force,
        log: rt.log,
      });
      for (const p of removedWorktrees) summary.push(`Removed worktree ${p}.`);
      for (const errMsg of errors) summary.push(`Could not remove worktree: ${errMsg}`);
      summary.push(
        `Removed workspace "${matchedWorkspace.name}"${workspaceFileDeleted ? ` and deleted ${matchedWorkspace.workspaceFile}` : ''}.`,
      );
      await store.load();
      return makeToolResult(summary.join('\n'));
    }

    const matchingRepos = store.repos.filter((repo) =>
      repo.rows.some(
        (r) =>
          !r.isMain &&
          (r.path === target ||
            path.resolve(r.path) === path.resolve(target) ||
            r.name.toLowerCase() === lower ||
            r.branch?.toLowerCase() === lower),
      ),
    );

    const repoRoots =
      matchingRepos.length > 0 ? matchingRepos.map((r) => r.root) : [requireActiveRepoRoot(store.roots)];

    for (const cwd of repoRoots) {
      const res = await removeWorktree({
        cwd,
        target,
        deleteBranch,
        force,
        log: rt.log,
      });
      summary.push(`Removed worktree ${res.path}${res.branchDeleted ? ` (deleted branch ${res.branch})` : ''}.`);
    }

    await store.load();
    return makeToolResult(summary.join('\n'));
  } catch (err) {
    return makeToolResult(`Failed to remove workspace/worktree: ${(err as Error).message}`);
  }
}
