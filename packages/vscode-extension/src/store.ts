import { type Logger, type WorktreeInfo, listWorktrees } from '@para-space/core';
import * as vscode from 'vscode';
import { currentWorktree } from './items.js';
import { findWorkspaceRoot } from './workspace.js';

/**
 * The one place the extension loads worktrees. The tree view and the status bar render from it,
 * so a refresh runs `listWorktrees` once, however many views listen (D-033).
 */
export class WorktreeStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires after every load, successful or not. */
  readonly onDidChange = this.changed.event;

  /** Repo root the rows belong to; `undefined` when no folder is open. */
  root: string | undefined;
  rows: WorktreeInfo[] = [];
  /** Why the last load failed, if it did. */
  error: string | undefined;

  private loading: Promise<void> | undefined;
  private stale = false;

  constructor(private readonly log: Logger) {}

  /** The row for the worktree this window has open. */
  get current(): WorktreeInfo | undefined {
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
    this.root = findWorkspaceRoot();
    try {
      this.rows = this.root ? await listWorktrees({ cwd: this.root, log: this.log }) : [];
      this.error = undefined;
    } catch (err) {
      this.rows = [];
      this.error = (err as Error).message;
      this.log.warn(this.error);
    }
    this.changed.fire();
  }
}
