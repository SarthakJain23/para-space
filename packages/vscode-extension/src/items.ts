import type { LedgerEntry, WorktreeInfo, WorkspaceRecord } from '@para-space/core';
import { isInside } from './dialogs.js';

// Pure row text for the tree, switcher and status bar. No `vscode` import, so it is unit-testable (GUIDELINES 6.3).

/** Plain shape of a switcher row (structurally a `vscode.QuickPickItem`). */
export interface WorktreeItem {
  label: string;
  description?: string;
  detail?: string;
  /** Worktree folder or workspace file; absent on the "Create Worktree…" row. */
  path?: string;
  /** The worktree or workspace this window has open. */
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
  const deps = w.diverged ? `${w.depsMode} (diverged)` : w.depsMode;
  return [
    w.branch ?? '(no branch)',
    w.dirty ? `${w.dirty} dirty` : 'clean',
    w.port !== undefined ? `:${w.port}` : undefined,
    deps,
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
    `Dependencies: ${w.depsMode}${w.diverged ? ' (diverged from main — isolation recommended)' : ''}`,
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
export function toWorktreeItem(w: WorktreeInfo, current = false, repoName?: string): WorktreeItem {
  const icon = current ? 'check' : w.diverged ? 'warning' : w.isMain ? 'repo' : 'git-branch';
  const prefix = repoName ? `[${repoName}] ` : '';
  return {
    label: `$(${icon}) ${prefix}${w.name}`,
    description: current ? `current · ${describeWorktree(w)}` : describeWorktree(w),
    detail: w.path,
    path: w.path,
    current,
  };
}

/** Turns a WorkspaceRecord into a switcher item for multi-repo workspaces. */
export function toWorkspaceItem(ws: WorkspaceRecord, current = false): WorktreeItem {
  const icon = current ? 'check' : 'root-folder';
  const repoNames = ws.repos.map((r) => r.name).join(', ');
  return {
    label: `$(${icon}) [Workspace] ${ws.branch}`,
    description: current
      ? `current · ${ws.repos.length} repos (${repoNames})`
      : `${ws.repos.length} repos (${repoNames})`,
    detail: ws.workspaceFile,
    path: ws.workspaceFile,
    current,
  };
}

/** Switcher rows: "Create Worktree…" first, then any multi-repo workspaces, then every worktree, the current one checked. */
export function switcherItems(
  rows: WorktreeInfo[],
  current: WorktreeInfo | undefined,
  repoNameForPath?: (path: string) => string | undefined,
  workspaces?: WorkspaceRecord[],
  currentWorkspace?: WorkspaceRecord,
): WorktreeItem[] {
  const wsItems = (workspaces ?? []).map((ws) => toWorkspaceItem(ws, ws.id === currentWorkspace?.id));
  return [
    CREATE_ITEM,
    ...wsItems,
    ...rows.map((r) => toWorktreeItem(r, r.path === current?.path, repoNameForPath?.(r.path))),
  ];
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

export interface LedgerDetailItem {
  kind: 'requirement' | 'decision' | 'problemSolved';
  label: string;
  tooltip: string;
  icon: string;
}

/** Formats a Date as YYYY-MM-DD HH:MM. */
export function formatLedgerDate(d?: Date): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Multi-line hover text for a ledger entry. */
export function ledgerTooltip(e: LedgerEntry): string {
  const d = formatLedgerDate(e.date);
  return [
    d ? `[${d}] ${e.title}` : e.title,
    '',
    `Requirement: ${e.requirement}`,
    'Decisions:',
    ...e.decisions.map((dec) => `  • ${dec}`),
    `Problem Solved: ${e.problemSolved}`,
  ].join('\n');
}

/** Decomposes a ledger entry into detail items for tree display. */
export function toLedgerDetails(e: LedgerEntry): LedgerDetailItem[] {
  const items: LedgerDetailItem[] = [
    {
      kind: 'requirement',
      label: `Requirement: ${e.requirement}`,
      tooltip: e.requirement,
      icon: 'info',
    },
  ];
  for (const d of e.decisions) {
    items.push({
      kind: 'decision',
      label: `Decision: ${d}`,
      tooltip: d,
      icon: 'check',
    });
  }
  items.push({
    kind: 'problemSolved',
    label: `Problem Solved: ${e.problemSolved}`,
    tooltip: e.problemSolved,
    icon: 'pass',
  });
  return items;
}
