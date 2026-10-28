import path from 'node:path';
import {
  type CodeWorkspaceConfig,
  type CodeWorkspaceFolder,
  type WorkspaceRecord,
  type WorktreeInfo,
  buildMultiRepoWorkspaceConfig,
  colorForHex,
  multiRepoWorkspaceFilePath,
  parsePortPool,
  sharedBranches,
  slugify,
  validateBranchName,
} from '@para-space/core';

export {
  sharedBranches,
  buildMultiRepoWorkspaceConfig,
  colorForHex,
  multiRepoWorkspaceFilePath,
  validateBranchName,
  type CodeWorkspaceFolder,
  type CodeWorkspaceConfig,
};

// Pure dialog logic (validation, choices). No `vscode` import, so it is unit-testable (GUIDELINES 6.3).

/** Input-box validator for a TCP port (1–65535). */
export function validatePort(value: string): string | undefined {
  return /^\d+$/.test(value.trim()) && +value > 0 && +value < 65536 ? undefined : 'Enter a port between 1 and 65535';
}

/** Input-box validator for a pool range such as `3001-3020`; reuses core's parser for the rules. */
export function validatePoolRange(value: string): string | undefined {
  try {
    parsePortPool(value.trim());
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

/** True if `child` is `parent` or inside it. Used to refuse removing the worktree this window has open. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface RemoveChoice {
  label: string;
  force: boolean;
  deleteBranch: boolean;
}

export interface RemoveWorkspaceChoice {
  label: string;
  removeWorktrees: boolean;
  deleteWorkspaceFile: boolean;
  force: boolean;
  deleteBranch: boolean;
}

/**
 * Text and buttons for the Remove Worktree confirmation. A dirty worktree only offers
 * "Force Remove" variants, and the detail says what will be lost.
 *
 * @example
 * removeDialog({ name: 'app-feat-x', branch: 'feat/x', dirty: 0, ... }).choices.map((c) => c.label);
 * // → ['Remove', 'Remove and Delete Branch']
 */
export function removeDialog(w: WorktreeInfo): { message: string; detail: string; choices: RemoveChoice[] } {
  const force = w.dirty > 0;
  const verb = force ? 'Force Remove' : 'Remove';
  const choices: RemoveChoice[] = [{ label: verb, force, deleteBranch: false }];
  if (w.branch) choices.push({ label: `${verb} and Delete Branch`, force, deleteBranch: true });
  const detail = [
    w.path,
    force ? `It has ${w.dirty} uncommitted change(s), which will be lost.` : undefined,
    w.branch
      ? force
        ? 'Deleting the branch also discards commits that are not merged.'
        : 'The branch is only deleted if it is fully merged.'
      : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { message: `Remove worktree ${w.name}?`, detail, choices };
}

/**
 * Text and buttons for the Remove Multi-Repository Workspace confirmation.
 * Offers cascading removal of member worktrees (with force when any member worktree is dirty)
 * as well as removing only the workspace file.
 */
export function removeWorkspaceDialog(
  workspace: WorkspaceRecord,
  dirtyRepos: Array<{ name: string; dirty: number }> = [],
): { message: string; detail: string; choices: RemoveWorkspaceChoice[] } {
  const force = dirtyRepos.length > 0;
  const verb = force ? 'Force Remove' : 'Remove';
  const choices: RemoveWorkspaceChoice[] = [
    {
      label: `${verb} Workspace & Worktrees`,
      removeWorktrees: true,
      deleteWorkspaceFile: true,
      force,
      deleteBranch: false,
    },
    {
      label: `${verb} Workspace, Worktrees & Branches`,
      removeWorktrees: true,
      deleteWorkspaceFile: true,
      force,
      deleteBranch: true,
    },
    {
      label: 'Remove Workspace Only (Keep Worktrees)',
      removeWorktrees: false,
      deleteWorkspaceFile: true,
      force: false,
      deleteBranch: false,
    },
  ];
  const repoSummary = workspace.repos.map((r) => `• ${r.name}: ${r.worktreePath}`).join('\n');
  const dirtySummary = force
    ? `Uncommitted changes in: ${dirtyRepos.map((d) => `${d.name} (${d.dirty})`).join(', ')} — these will be discarded if worktrees are removed.`
    : undefined;
  const detail = [workspace.workspaceFile, repoSummary, dirtySummary].filter(Boolean).join('\n\n');
  return {
    message: `Remove workspace ${workspace.name}?`,
    detail,
    choices,
  };
}

export interface BranchPickItem {
  label: string;
  description?: string;
  branch?: string;
  isCreate: boolean;
  alwaysShow?: boolean;
}

/**
 * Builds quick pick items for branch selection.
 * Always places a "Create new branch" option at the top (customized with typed text if valid and not existing).
 * De-duplicates and lists all existing branches.
 */
export function buildBranchPickItems(filterText: string, branches: string[]): BranchPickItem[] {
  const trimmed = filterText.trim();
  const items: BranchPickItem[] = [];
  const uniqueBranches = Array.from(new Set(branches));

  if (trimmed) {
    const isExactMatch = uniqueBranches.includes(trimmed);
    const isValid = validateBranchName(trimmed) === undefined;
    if (isValid && !isExactMatch) {
      items.push({
        label: `$(plus) Create new branch "${trimmed}"`,
        description: 'New branch',
        branch: trimmed,
        isCreate: true,
        alwaysShow: true,
      });
    }
  } else {
    items.push({
      label: '$(plus) Create new branch…',
      description: 'Enter a branch name',
      isCreate: true,
      alwaysShow: true,
    });
  }

  for (const b of uniqueBranches) {
    items.push({
      label: b,
      branch: b,
      isCreate: false,
    });
  }

  return items;
}
