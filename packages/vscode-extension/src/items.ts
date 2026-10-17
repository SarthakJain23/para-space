import type { WorktreeInfo } from '@para-space/core';

/** Plain shape of a quick-pick row; kept free of the `vscode` module so it is unit-testable. */
export interface WorktreeItem {
  label: string;
  description: string;
  detail: string;
  path: string;
}

/**
 * Turns a `listWorktrees` row into a quick-pick row: name, then branch · status · port · deps mode.
 *
 * @example
 * toWorktreeItem({ name: 'app-feat-x', branch: 'feat/x', dirty: 2, port: 3001, depsMode: 'Symlinked', ... });
 * // → { label: 'app-feat-x', description: 'feat/x · 2 dirty · :3001 · Symlinked', detail: '/code/app-feat-x', ... }
 */
export function toWorktreeItem(w: WorktreeInfo): WorktreeItem {
  const parts = [
    w.branch ?? '(no branch)',
    w.dirty ? `${w.dirty} dirty` : 'clean',
    w.port !== undefined ? `:${w.port}` : undefined,
    w.depsMode,
    w.managed ? undefined : 'unmanaged',
  ];
  return {
    label: w.name,
    description: parts.filter(Boolean).join(' · '),
    detail: w.path,
    path: w.path,
  };
}
