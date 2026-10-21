import type { WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import {
  buildBranchPickItems,
  buildMultiRepoWorkspaceConfig,
  isInside,
  multiRepoWorkspaceFilePath,
  removeDialog,
  sharedBranches,
  validateBranchName,
  validatePoolRange,
  validatePort,
} from '../src/dialogs.js';

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

describe('buildBranchPickItems', () => {
  const branches = ['main', 'feat/login', 'feat/dashboard'];

  it('empty input shows create placeholder and all branches', () => {
    const items = buildBranchPickItems('', branches);
    expect(items[0]).toEqual({
      label: '$(plus) Create new branch…',
      description: 'Enter a branch name',
      isCreate: true,
      alwaysShow: true,
    });
    expect(items.slice(1).map((i) => i.branch)).toEqual(branches);
  });

  it('typed new branch shows create option with branch name at top', () => {
    const items = buildBranchPickItems('feat/new-ui', branches);
    expect(items[0]).toEqual({
      label: '$(plus) Create new branch "feat/new-ui"',
      description: 'New branch',
      branch: 'feat/new-ui',
      isCreate: true,
      alwaysShow: true,
    });
    expect(items.slice(1).map((i) => i.branch)).toEqual(branches);
  });

  it('typed existing branch does not show create option', () => {
    const items = buildBranchPickItems('main', branches);
    expect(items.every((i) => i.isCreate === false)).toBe(true);
    expect(items.map((i) => i.branch)).toEqual(branches);
  });

  it('invalid branch name does not show create option', () => {
    const items = buildBranchPickItems('bad name with spaces', branches);
    expect(items.every((i) => i.isCreate === false)).toBe(true);
  });

  it('de-duplicates branches in the list', () => {
    const items = buildBranchPickItems('', ['main', 'main', 'feat/x']);
    expect(items.slice(1).map((i) => i.branch)).toEqual(['main', 'feat/x']);
  });
});

describe('sharedBranches', () => {
  it('returns only branches present in every repo, preserving the first repo order', () => {
    expect(
      sharedBranches([
        ['main', 'feat/a', 'release'],
        ['release', 'main'],
        ['main', 'release', 'fix/b'],
      ]),
    ).toEqual(['main', 'release']);
  });

  it('returns the available branches for a single repo', () => {
    expect(sharedBranches([['main', 'main', 'feat/a']])).toEqual(['main', 'feat/a']);
  });

  it('returns no shared branches when repositories have no common branch', () => {
    expect(sharedBranches([['main'], ['develop']])).toEqual([]);
  });
});

describe('multi-repo workspace config helpers', () => {
  it('buildMultiRepoWorkspaceConfig creates new folder entries when no existing config', () => {
    const res = buildMultiRepoWorkspaceConfig([
      { mainRoot: '/code/frontend', worktreePath: '/code/frontend-feat-x' },
      { mainRoot: '/code/backend', worktreePath: '/code/backend-feat-x' },
    ]);
    expect(res.folders).toEqual([
      { name: 'frontend', path: '/code/frontend-feat-x' },
      { name: 'backend', path: '/code/backend-feat-x' },
    ]);
  });

  it('buildMultiRepoWorkspaceConfig includes only selected worktrees and preserves settings', () => {
    const existing = {
      folders: [
        { name: 'web', path: '/code/frontend' },
        { name: 'api', path: '/code/backend' },
        { name: 'docs', path: '/code/docs' },
      ],
      settings: { 'editor.tabSize': 2 },
    };
    const res = buildMultiRepoWorkspaceConfig(
      [
        { mainRoot: '/code/frontend', worktreePath: '/code/frontend-feat-x' },
        { mainRoot: '/code/backend', worktreePath: '/code/backend-feat-x' },
      ],
      existing,
    );
    expect(res.settings).toEqual({ 'editor.tabSize': 2 });
    expect(res.folders).toEqual([
      { name: 'frontend', path: '/code/frontend-feat-x' },
      { name: 'backend', path: '/code/backend-feat-x' },
    ]);
  });

  it('multiRepoWorkspaceFilePath derives path from existing workspace file', () => {
    const p = multiRepoWorkspaceFilePath(
      ['/code/frontend-feat-x', '/code/backend-feat-x'],
      'feat/x',
      '/code/my-app.code-workspace',
    );
    expect(p).toBe('/code/my-app-feat-x.code-workspace');
  });

  it('multiRepoWorkspaceFilePath derives path from parent directory and workspace name when no existing file', () => {
    const p = multiRepoWorkspaceFilePath(
      ['/code/frontend-feat-x', '/code/backend-feat-x'],
      'feat/x',
      undefined,
      'My Project (Workspace)',
    );
    expect(p).toBe('/code/My-Project-feat-x.code-workspace');
  });
});
