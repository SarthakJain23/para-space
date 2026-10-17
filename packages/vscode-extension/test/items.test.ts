import type { WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import { toWorktreeItem } from '../src/items.js';

const row = (over: Partial<WorktreeInfo>): WorktreeInfo => ({
  name: 'app-feat-x',
  path: '/code/app-feat-x',
  branch: 'feat/x',
  isMain: false,
  dirty: 0,
  depsMode: 'Symlinked',
  managed: true,
  ...over,
});

describe('toWorktreeItem', () => {
  it('shows branch, status, port and deps mode', () => {
    expect(toWorktreeItem(row({ dirty: 2, port: 3001 }))).toEqual({
      label: 'app-feat-x',
      description: 'feat/x · 2 dirty · :3001 · Symlinked',
      detail: '/code/app-feat-x',
      path: '/code/app-feat-x',
    });
  });

  it('omits a missing port and flags unmanaged worktrees', () => {
    expect(toWorktreeItem(row({ branch: undefined, depsMode: 'None', managed: false })).description).toBe(
      '(no branch) · clean · None · unmanaged',
    );
  });
});
