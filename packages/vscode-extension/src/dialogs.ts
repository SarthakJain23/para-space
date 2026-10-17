import path from 'node:path';
import { type WorktreeInfo, parsePortPool } from '@para-space/core';

// Pure dialog logic (validation, choices). No `vscode` import, so it is unit-testable (GUIDELINES 6.3).

/**
 * Input-box validator for a git branch name; `undefined` means valid.
 *
 * @example
 * validateBranchName('feat/TK-101'); // → undefined
 * validateBranchName('my branch');   // → 'Branch names cannot contain spaces'
 */
export function validateBranchName(value: string): string | undefined {
  const s = value.trim();
  if (!s) return 'Enter a branch name';
  if (/\s/.test(s)) return 'Branch names cannot contain spaces';
  if (s.startsWith('-') || s.endsWith('/') || s.endsWith('.lock') || s.includes('..') || /[~^:?*[\\]/.test(s)) {
    return 'Not a valid git branch name';
  }
  return undefined;
}

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
