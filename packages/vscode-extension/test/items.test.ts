import type { WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import {
  CREATE_ITEM,
  currentWorktree,
  describeWorktree,
  statusBarText,
  switcherItems,
  toWorktreeItem,
  worktreeTooltip,
} from '../src/items.js';

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
      label: '$(git-branch) app-feat-x',
      description: 'feat/x · 2 dirty · :3001 · Symlinked',
      detail: '/code/app-feat-x',
      path: '/code/app-feat-x',
      current: false,
    });
  });

  it('checks the current worktree and uses the repo icon for main', () => {
    const item = toWorktreeItem(row({}), true);
    expect(item.label).toBe('$(check) app-feat-x');
    expect(item.description).toMatch(/^current · /);
    expect(toWorktreeItem(row({ isMain: true, name: '(main)' })).label).toBe('$(repo) (main)');
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

describe('switcher and status bar', () => {
  const main = row({ name: '(main)', path: '/code/app', branch: 'main', isMain: true, port: 3000, depsMode: 'Source' });
  const feat = row({ port: 3001 });
  const rows = [main, feat];

  it('finds the current worktree, preferring the deepest match', () => {
    expect(currentWorktree(rows, '/code/app')).toBe(main);
    expect(currentWorktree(rows, '/code/app-feat-x/packages/web')).toBe(feat);
    expect(currentWorktree(rows, '/elsewhere')).toBeUndefined();
  });

  it('puts Create first and checks only the current row', () => {
    const items = switcherItems(rows, feat);
    expect(items[0]).toBe(CREATE_ITEM);
    expect(items.slice(1).map((i) => i.current)).toEqual([false, true]);
  });

  it('formats the status bar text', () => {
    expect(statusBarText(feat)).toBe('$(git-branch) feat/x · :3001');
    expect(statusBarText(main)).toBe('$(repo) main · :3000');
    expect(statusBarText(row({ branch: undefined }))).toBe('$(git-branch) app-feat-x');
  });
});
