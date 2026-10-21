import path from 'node:path';
import {
  type CodeWorkspaceConfig,
  type CodeWorkspaceFolder,
  type WorktreeInfo,
  buildMultiRepoWorkspaceConfig,
  multiRepoWorkspaceFilePath,
  parsePortPool,
  sharedBranches,
  slugify,
  validateBranchName,
} from '@para-space/core';

export {
  sharedBranches,
  buildMultiRepoWorkspaceConfig,
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
