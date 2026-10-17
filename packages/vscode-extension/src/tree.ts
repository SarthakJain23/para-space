import { type Logger, type WorktreeInfo, listWorktrees } from '@para-space/core';
import * as vscode from 'vscode';
import { describeWorktree, worktreeTooltip } from './items.js';
import { findWorkspaceRoot } from './workspace.js';

/** A row in the Worktrees view. `contextValue` drives which menu actions appear (see package.json). */
export class WorktreeNode extends vscode.TreeItem {
  constructor(readonly info: WorktreeInfo) {
    super(info.name, vscode.TreeItemCollapsibleState.None);
    this.description = describeWorktree(info);
    this.tooltip = worktreeTooltip(info);
    this.iconPath = new vscode.ThemeIcon(info.isMain ? 'repo' : 'git-branch');
    // worktree.main · worktree.linked · worktree.linked.shared (deps still symlinked → can isolate)
    this.contextValue = info.isMain
      ? 'worktree.main'
      : `worktree.linked${info.depsMode === 'Symlinked' ? '.shared' : ''}`;
  }
}

/** Data source for the `paraSpace.worktrees` view: one flat list from core's `listWorktrees()`. */
export class WorktreeTreeProvider implements vscode.TreeDataProvider<WorktreeNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  /** Set by `extension.ts`; shows load errors above the (empty) tree. */
  view?: vscode.TreeView<WorktreeNode>;

  constructor(private readonly log: Logger) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(node: WorktreeNode): WorktreeNode {
    return node;
  }

  async getChildren(node?: WorktreeNode): Promise<WorktreeNode[]> {
    if (node) return [];
    const cwd = findWorkspaceRoot();
    if (!cwd) return []; // the view's welcome text explains what to do
    try {
      const rows = await listWorktrees({ cwd, log: this.log });
      this.setMessage(undefined);
      return rows.map((r) => new WorktreeNode(r));
    } catch (err) {
      const message = (err as Error).message;
      this.log.warn(message);
      this.setMessage(`Could not list worktrees for ${cwd}: ${message}`);
      return [];
    }
  }

  dispose(): void {
    this.changed.dispose();
  }

  private setMessage(message: string | undefined): void {
    if (this.view) this.view.message = message;
  }
}
