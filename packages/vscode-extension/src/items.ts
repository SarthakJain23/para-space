import type { WorktreeInfo } from '@para-space/core';

/** Plain shape of a quick-pick row; kept free of the `vscode` module so it is unit-testable. */
export interface WorktreeItem {
  label: string;
  description: string;
  detail: string;
  path: string;
}

/**
 * One-line summary of a worktree: branch · status · port · deps mode (· unmanaged).
 * Shared by the quick pick and the tree view.
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
 * Multi-line hover text for a tree row.
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
 * Turns a `listWorktrees` row into a quick-pick row: name, summary, and path as detail.
 *
 * @example
 * toWorktreeItem(row);
 * // → { label: 'app-feat-x', description: 'feat/x · 2 dirty · :3001 · Symlinked', detail: '/code/app-feat-x', ... }
 */
export function toWorktreeItem(w: WorktreeInfo): WorktreeItem {
  return { label: w.name, description: describeWorktree(w), detail: w.path, path: w.path };
}
