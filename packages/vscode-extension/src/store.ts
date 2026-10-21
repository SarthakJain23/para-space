import path from 'node:path';
import {
  type Logger,
  type WorktreeInfo,
  type WorkspaceRecord,
  getWorkspaceRecords,
  listWorktrees,
} from '@para-space/core';
import * as vscode from 'vscode';
import { currentWorktree } from './items.js';
import { findActiveRepoRoot, getIncludedRepoRoots } from './workspace.js';

export interface RepoWorktrees {
  root: string;
  name: string;
  rows: WorktreeInfo[];
  error?: string;
}

/**
 * The one place the extension loads worktrees. Manages all included repositories
 * in multi-root workspaces, so tree views and status bar render consistently (D-033).
 */
export class WorktreeStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires after every load, successful or not. */
  readonly onDidChange = this.changed.event;

  /** All repositories managed in the current workspace. */
  repos: RepoWorktrees[] = [];
  /** Included repository root paths. */
  roots: string[] = [];
  /** Multi-repository workspaces associated with the current roots. */
  workspaces: WorkspaceRecord[] = [];

  /** Why the last load failed entirely, if it did. */
  error: string | undefined;

  private loading: Promise<void> | undefined;
  private stale = false;

  constructor(
    private readonly log: Logger,
    private readonly memento?: vscode.Memento,
  ) {}

  /** Active repository root (from active editor, or the first repo). */
  get root(): string | undefined {
    return findActiveRepoRoot(this.roots);
  }

  /** Worktrees belonging to the active repository (or all rows if only one repo). */
  get rows(): WorktreeInfo[] {
    const active = this.repos.find((r) => r.root === this.root);
    return active ? active.rows : this.allRows;
  }

  /** All worktree rows across all included repositories. */
  get allRows(): WorktreeInfo[] {
    return this.repos.flatMap((r) => r.rows);
  }

  /** The multi-repo workspace this window currently has open, if any. */
  get currentWorkspace(): WorkspaceRecord | undefined {
    const wsFile = vscode.workspace.workspaceFile?.fsPath;
    if (!wsFile) return undefined;
    return this.workspaces.find((w) => path.resolve(w.workspaceFile) === path.resolve(wsFile));
  }

  /** The row for the worktree this window has open. */
  get current(): WorktreeInfo | undefined {
    const editor = vscode.window.activeTextEditor;
    const activePath = editor ? editor.document.uri.fsPath : undefined;
    if (activePath) {
      const match = currentWorktree(this.allRows, activePath);
      if (match) return match;
    }
    return this.root ? currentWorktree(this.rows, this.root) : undefined;
  }

  /** Reload from core. A call made while a load is running triggers one more load afterwards. */
  load(): Promise<void> {
    if (this.loading) {
      this.stale = true;
      return this.loading;
    }
    this.loading = (async () => {
      do {
        this.stale = false;
        await this.fetch();
      } while (this.stale);
    })().finally(() => (this.loading = undefined));
    return this.loading;
  }

  dispose(): void {
    this.changed.dispose();
  }

  private async fetch(): Promise<void> {
    this.roots = await getIncludedRepoRoots(this.memento);
    const results: RepoWorktrees[] = [];

    for (const root of this.roots) {
      try {
        const rows = await listWorktrees({ cwd: root, log: this.log });
        results.push({ root, name: path.basename(root), rows });
      } catch (err) {
        const message = (err as Error).message;
        results.push({ root, name: path.basename(root), rows: [], error: message });
        this.log.warn(`Could not list worktrees for ${root}: ${message}`);
      }
    }

    this.repos = results;
    try {
      this.workspaces = await getWorkspaceRecords(this.roots);
    } catch (err) {
      this.workspaces = [];
      this.log.warn(`Could not load workspaces: ${(err as Error).message}`);
    }

    this.error =
      this.repos.length > 0 && this.repos.every((r) => r.error)
        ? this.repos.map((r) => `${r.name}: ${r.error}`).join('; ')
        : undefined;

    this.changed.fire();
  }
}
