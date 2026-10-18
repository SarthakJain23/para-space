import type { WorktreeInfo } from '@para-space/core';
import * as vscode from 'vscode';
import { describeWorktree, worktreeTooltip } from './items.js';
import type { RepoWorktrees, WorktreeStore } from './store.js';

/** A repository node in multi-root workspaces. */
export class RepoNode extends vscode.TreeItem {
  constructor(readonly repo: RepoWorktrees) {
    super(repo.name, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${repo.rows.length} worktree${repo.rows.length === 1 ? '' : 's'}`;
    this.tooltip = repo.root;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'paraSpace.repo';
  }
}

/** A row in the Worktrees view. `contextValue` drives which menu actions appear (see package.json). */
export class WorktreeNode extends vscode.TreeItem {
  constructor(
    readonly info: WorktreeInfo,
    isCurrent: boolean,
    readonly repoRoot?: string,
  ) {
    super(info.name, vscode.TreeItemCollapsibleState.None);
    this.description = describeWorktree(info);
    this.tooltip = worktreeTooltip(info);
    this.iconPath = isCurrent
      ? new vscode.ThemeIcon('check')
      : info.diverged
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
        : new vscode.ThemeIcon(info.isMain ? 'repo' : 'git-branch');
    // worktree.main · worktree.linked · worktree.linked.shared · worktree.linked.shared.diverged
    const sharedKind = info.diverged ? '.shared.diverged' : '.shared';
    this.contextValue = info.isMain
      ? 'worktree.main'
      : `worktree.linked${info.depsMode === 'Symlinked' ? sharedKind : ''}`;
  }
}

export type WorktreeTreeNode = RepoNode | WorktreeNode;

/** Renders the `paraSpace.worktrees` view: grouped by repo when multiple repos exist, flat when single repo. */
export class WorktreeTreeProvider implements vscode.TreeDataProvider<WorktreeTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<WorktreeTreeNode>;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly store: WorktreeStore) {
    this.view = vscode.window.createTreeView('paraSpace.worktrees', { treeDataProvider: this });
    this.subscription = store.onDidChange(() => {
      this.view.message = store.error ? `Errors: ${store.error}` : undefined;
      this.changed.fire();
    });
  }

  getTreeItem(node: WorktreeTreeNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: WorktreeTreeNode): WorktreeTreeNode[] {
    const current = this.store.current;
    if (!node) {
      if (this.store.repos.length <= 1) {
        return this.store.rows.map((r) => new WorktreeNode(r, r.path === current?.path, this.store.root));
      }
      return this.store.repos.map((repo) => new RepoNode(repo));
    }
    if (node instanceof RepoNode) {
      return node.repo.rows.map((r) => new WorktreeNode(r, r.path === current?.path, node.repo.root));
    }
    return [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.view.dispose();
    this.changed.dispose();
  }
}
