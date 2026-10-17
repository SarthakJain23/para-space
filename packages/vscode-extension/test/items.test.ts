import type { WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import { describeWorktree, toWorktreeItem, worktreeTooltip } from '../src/items.js';

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
    expect(describeWorktree(row({ branch: undefined, depsMode: 'None', managed: false }))).toBe(
      '(no branch) · clean · None · unmanaged',
    );
  });
});

describe('worktreeTooltip', () => {
  it('lists path, branch, status, port and deps mode', () => {
    expect(worktreeTooltip(row({ dirty: 1, port: 3001 }))).toBe(
      [
        'app-feat-x',
        '/code/app-feat-x',
        '',
        'Branch: feat/x',
        'Status: 1 uncommitted change(s)',
        'Port: 3001',
        'Dependencies: Symlinked',
      ].join('\n'),
    );
  });

  it('notes missing ports and unmanaged worktrees', () => {
    const tip = worktreeTooltip(row({ managed: false }));
    expect(tip).toContain('Port: not assigned');
    expect(tip).toContain('Not created by ParaSpace.');
  });
});
