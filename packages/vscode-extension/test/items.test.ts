import type { LedgerEntry, WorktreeInfo } from '@para-space/core';
import { describe, expect, it } from 'vitest';
import {
  CREATE_ITEM,
  currentWorktree,
  describeWorktree,
  formatLedgerDate,
  ledgerTooltip,
  statusBarText,
  switcherItems,
  toLedgerDetails,
  toWorkspaceItem,
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

  it('flags diverged dependencies in description and switcher item', () => {
    const divergedRow = row({ diverged: true });
    expect(describeWorktree(divergedRow)).toBe('feat/x · clean · Symlinked (diverged)');
    const item = toWorktreeItem(divergedRow, false);
    expect(item.label).toBe('$(warning) app-feat-x');
    expect(item.description).toContain('Symlinked (diverged)');
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

  it('prefixes repo name in switcher items when repoNameForPath is provided', () => {
    const items = switcherItems(rows, feat, (p) => (p.includes('app-feat') ? 'frontend' : 'backend'));
    expect(items[1].label).toBe('$(repo) [backend] (main)');
    expect(items[2].label).toBe('$(check) [frontend] app-feat-x');
  });

  it('includes multi-repo workspaces in switcher items', () => {
    const ws = {
      id: '/code/app.code-workspace',
      name: 'app',
      workspaceFile: '/code/app.code-workspace',
      branch: 'feat/cross',
      repos: [
        { root: '/code/app', name: 'app', worktreePath: '/code/app-feat-cross' },
        { root: '/code/api', name: 'api', worktreePath: '/code/api-feat-cross' },
      ],
      createdAt: '',
    };
    const items = switcherItems(rows, undefined, undefined, [ws]);
    expect(items[0]).toBe(CREATE_ITEM);
    expect(items[1].label).toBe('$(root-folder) [Workspace] feat/cross');
    expect(items[1].description).toContain('2 repos (app, api)');
    expect(items[1].path).toBe('/code/app.code-workspace');
  });

  it('formats the status bar text', () => {
    expect(statusBarText(feat)).toBe('$(git-branch) feat/x · :3001');
    expect(statusBarText(main)).toBe('$(repo) main · :3000');
    expect(statusBarText(row({ branch: undefined }))).toBe('$(git-branch) app-feat-x');
  });
});

describe('ledger items', () => {
  const entry: LedgerEntry = {
    title: 'Worktree Created: feat/TK-101',
    requirement: 'Auth redesign',
    decisions: ['Symlinked node_modules', 'Assigned port 3001'],
    problemSolved: 'Prevented port collision',
    date: new Date('2026-10-17T14:30:00'),
  };

  it('formats dates consistently', () => {
    expect(formatLedgerDate(entry.date)).toBe('2026-10-17 14:30');
    expect(formatLedgerDate(undefined)).toBe('');
  });

  it('generates rich tooltip', () => {
    const tip = ledgerTooltip(entry);
    expect(tip).toContain('[2026-10-17 14:30] Worktree Created: feat/TK-101');
    expect(tip).toContain('Requirement: Auth redesign');
    expect(tip).toContain('• Symlinked node_modules');
    expect(tip).toContain('• Assigned port 3001');
    expect(tip).toContain('Problem Solved: Prevented port collision');
  });

  it('converts entry to details with correct icons and kinds', () => {
    const details = toLedgerDetails(entry);
    expect(details).toHaveLength(4);
    expect(details[0]).toEqual({
      kind: 'requirement',
      label: 'Requirement: Auth redesign',
      tooltip: 'Auth redesign',
      icon: 'info',
    });
    expect(details[1]).toEqual({
      kind: 'decision',
      label: 'Decision: Symlinked node_modules',
      tooltip: 'Symlinked node_modules',
      icon: 'check',
    });
    expect(details[2]).toEqual({
      kind: 'decision',
      label: 'Decision: Assigned port 3001',
      tooltip: 'Assigned port 3001',
      icon: 'check',
    });
    expect(details[3]).toEqual({
      kind: 'problemSolved',
      label: 'Problem Solved: Prevented port collision',
      tooltip: 'Prevented port collision',
      icon: 'pass',
    });
  });
});
