import type { WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import { isInside, removeDialog, validateBranchName, validatePoolRange, validatePort } from '../src/dialogs.js';

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

describe('validators', () => {
  it('branch names', () => {
    expect(validateBranchName('feat/TK-101')).toBeUndefined();
    expect(validateBranchName('  ')).toBe('Enter a branch name');
    expect(validateBranchName('my branch')).toMatch(/spaces/);
    for (const bad of ['-x', 'a..b', 'x/', 'a.lock', 'a:b', 'a~1', 'a[b']) {
      expect(validateBranchName(bad)).toBe('Not a valid git branch name');
    }
  });

  it('ports and pool ranges', () => {
    expect(validatePort('3000')).toBeUndefined();
    expect(validatePort('0')).toBeDefined();
    expect(validatePort('70000')).toBeDefined();
    expect(validatePort('abc')).toBeDefined();
    expect(validatePoolRange('3001-3020')).toBeUndefined();
    expect(validatePoolRange('3020-3001')).toMatch(/invalid/);
    expect(validatePoolRange('nope')).toMatch(/must look like/);
  });

  it('isInside', () => {
    expect(isInside('/code/app-x', '/code/app-x')).toBe(true);
    expect(isInside('/code/app-x/src', '/code/app-x')).toBe(true);
    expect(isInside('/code/app', '/code/app-x')).toBe(false);
    expect(isInside('/code/app-x-2', '/code/app-x')).toBe(false);
  });
});

describe('removeDialog', () => {
  it('clean worktree: plain remove, branch deleted only if merged', () => {
    const d = removeDialog(row({}));
    expect(d.message).toBe('Remove worktree app-feat-x?');
    expect(d.choices).toEqual([
      { label: 'Remove', force: false, deleteBranch: false },
      { label: 'Remove and Delete Branch', force: false, deleteBranch: true },
    ]);
    expect(d.detail).toContain('only deleted if it is fully merged');
  });

  it('dirty worktree: only force variants, and says what is lost', () => {
    const d = removeDialog(row({ dirty: 3 }));
    expect(d.choices.map((c) => [c.label, c.force])).toEqual([
      ['Force Remove', true],
      ['Force Remove and Delete Branch', true],
    ]);
    expect(d.detail).toContain('3 uncommitted change(s)');
  });

  it('detached worktree: no branch option', () => {
    expect(removeDialog(row({ branch: undefined })).choices).toHaveLength(1);
  });
});
