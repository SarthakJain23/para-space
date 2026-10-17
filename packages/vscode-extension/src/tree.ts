import type { WorktreeInfo } from '@para-space/core';
import * as vscode from 'vscode';
import { describeWorktree, worktreeTooltip } from './items.js';
import type { WorktreeStore } from './store.js';

/** A row in the Worktrees view. `contextValue` drives which menu actions appear (see package.json). */
export class WorktreeNode extends vscode.TreeItem {
  constructor(
    readonly info: WorktreeInfo,
    isCurrent: boolean,
  ) {
    super(info.name, vscode.TreeItemCollapsibleState.None);
    this.description = describeWorktree(info);
    this.tooltip = worktreeTooltip(info);
    this.iconPath = new vscode.ThemeIcon(isCurrent ? 'check' : info.isMain ? 'repo' : 'git-branch');
    // worktree.main · worktree.linked · worktree.linked.shared (deps still symlinked → can isolate)
    this.contextValue = info.isMain
      ? 'worktree.main'
      : `worktree.linked${info.depsMode === 'Symlinked' ? '.shared' : ''}`;
  }
}

/** Renders the `paraSpace.worktrees` view from the store: one flat list, current worktree checked. */
export class WorktreeTreeProvider implements vscode.TreeDataProvider<WorktreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<WorktreeNode>;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly store: WorktreeStore) {
    this.view = vscode.window.createTreeView('paraSpace.worktrees', { treeDataProvider: this });
    this.subscription = store.onDidChange(() => {
      // With no folder open the rows are empty and the view's welcome text explains what to do.
      this.view.message = store.error ? `Could not list worktrees for ${store.root}: ${store.error}` : undefined;
      this.changed.fire();
    });
  }

  getTreeItem(node: WorktreeNode): WorktreeNode {
    return node;
  }

  getChildren(node?: WorktreeNode): WorktreeNode[] {
    if (node) return [];
    const current = this.store.current;
    return this.store.rows.map((r) => new WorktreeNode(r, r.path === current?.path));
  }

  dispose(): void {
    this.subscription.dispose();
    this.view.dispose();
    this.changed.dispose();
  }
}
