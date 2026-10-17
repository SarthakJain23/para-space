import type { WorktreeInfo } from '@para-space/core';
import { isInside } from './dialogs.js';

// Pure row text for the tree, switcher and status bar. No `vscode` import, so it is unit-testable (GUIDELINES 6.3).

/** Plain shape of a switcher row (structurally a `vscode.QuickPickItem`). */
export interface WorktreeItem {
  label: string;
  description?: string;
  detail?: string;
  /** Worktree folder; absent on the "Create Worktree…" row. */
  path?: string;
  /** The worktree this window has open. */
  current?: boolean;
  alwaysShow?: boolean;
}

/** First row of the switcher. Compared by identity. */
export const CREATE_ITEM: WorktreeItem = { label: '$(add) Create Worktree…', alwaysShow: true };

/**
 * One-line summary of a worktree: branch · status · port · deps mode (· unmanaged).
 * Shared by the switcher and the tree view.
 *
 * @example
 * describeWorktree({ branch: 'feat/x', dirty: 2, port: 3001, depsMode: 'Symlinked', managed: true, ... });
 * // → 'feat/x · 2 dirty · :3001 · Symlinked'
 */
export function describeWorktree(w: WorktreeInfo): string {
  return [
    w.branch ?? '(no branch)',
    w.dirty ? `${w.dirty} dirty` : 'clean',
    w.port !== undefined ? `:${w.port}` : undefined,
    w.depsMode,
    w.managed ? undefined : 'unmanaged',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Multi-line hover text for a tree row or the status bar.
 *
 * @example
 * worktreeTooltip(row);
 * // → 'app-feat-x\n/code/app-feat-x\n\nBranch: feat/x\nStatus: clean\nPort: 3001\nDependencies: Symlinked'
 */
export function worktreeTooltip(w: WorktreeInfo): string {
  return [
    w.name,
    w.path,
    '',
    `Branch: ${w.branch ?? '(no branch)'}`,
    `Status: ${w.dirty ? `${w.dirty} uncommitted change(s)` : 'clean'}`,
    `Port: ${w.port ?? 'not assigned'}`,
    `Dependencies: ${w.depsMode}`,
    ...(w.managed ? [] : ['', 'Not created by ParaSpace.']),
  ].join('\n');
}

/**
 * Turns a `listWorktrees` row into a switcher row: icon + name, summary, and path as detail.
 * The current worktree gets a check mark.
 *
 * @example
 * toWorktreeItem(row, false);
 * // → { label: '$(git-branch) app-feat-x', description: 'feat/x · clean · :3001 · Symlinked', detail: '/code/app-feat-x', ... }
 */
export function toWorktreeItem(w: WorktreeInfo, current = false): WorktreeItem {
  const icon = current ? 'check' : w.isMain ? 'repo' : 'git-branch';
  return {
    label: `$(${icon}) ${w.name}`,
    description: current ? `current · ${describeWorktree(w)}` : describeWorktree(w),
    detail: w.path,
    path: w.path,
    current,
  };
}

/** Switcher rows: "Create Worktree…" first, then every worktree, the current one checked. */
export function switcherItems(rows: WorktreeInfo[], current: WorktreeInfo | undefined): WorktreeItem[] {
  return [CREATE_ITEM, ...rows.map((r) => toWorktreeItem(r, r.path === current?.path))];
}

/**
 * The worktree that contains `root` (the window's folder), preferring the deepest match.
 *
 * @example
 * currentWorktree(rows, '/code/app-feat-x/packages/web'); // → the app-feat-x row
 */
export function currentWorktree(rows: WorktreeInfo[], root: string): WorktreeInfo | undefined {
  return rows.filter((r) => isInside(root, r.path)).sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Status bar text for the current worktree: icon, branch (or name), and port.
 *
 * @example
 * statusBarText({ isMain: false, branch: 'feat/x', port: 3001, ... }); // → '$(git-branch) feat/x · :3001'
 * statusBarText({ isMain: true, branch: 'main', ... });                // → '$(repo) main'
 */
export function statusBarText(w: WorktreeInfo): string {
  const icon = w.isMain ? 'repo' : 'git-branch';
  const port = w.port !== undefined ? ` · :${w.port}` : '';
  return `$(${icon}) ${w.branch ?? w.name}${port}`;
}
