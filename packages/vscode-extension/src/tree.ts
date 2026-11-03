import path from 'node:path';
import type { WorktreeInfo, WorkspaceRecord } from '@para-space/core';
import * as vscode from 'vscode';
import { describeWorktree, filterTreeData, worktreeTooltip } from './items.js';
import type { RepoWorktrees, WorktreeStore } from './store.js';

/** A multi-repo workspace node in the sidebar tree. */
export class WorkspaceNode extends vscode.TreeItem {
  constructor(
    readonly workspace: WorkspaceRecord,
    isCurrent: boolean,
  ) {
    super(workspace.branch || workspace.name, vscode.TreeItemCollapsibleState.Collapsed);
    const repoNames = workspace.repos.map((r) => r.name).join(', ');
    this.description = isCurrent
      ? `current · ${workspace.repos.length} repos`
      : `${workspace.repos.length} repos (${repoNames})`;
    this.tooltip = `Multi-Repository Workspace\nBranch: ${workspace.branch}\nFile: ${workspace.workspaceFile}\n\nRepositories:\n${workspace.repos.map((r) => `  • ${r.name}: ${r.worktreePath}`).join('\n')}`;
    this.iconPath = isCurrent ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('root-folder');
    this.contextValue = 'paraSpace.workspace';
  }
}

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

export type WorktreeTreeNode = WorkspaceNode | RepoNode | WorktreeNode;

/** Renders the `paraSpace.worktrees` view: grouped by repo when multiple repos exist, flat when single repo. */
export class WorktreeTreeProvider implements vscode.TreeDataProvider<WorktreeTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<WorktreeTreeNode>;
  private readonly subscription: vscode.Disposable;
  private filter = '';

  constructor(private readonly store: WorktreeStore) {
    this.view = vscode.window.createTreeView('paraSpace.worktrees', { treeDataProvider: this });
    this.subscription = store.onDidChange(() => {
      this.updateViewState();
      this.changed.fire();
    });
  }

  /** Active search filter query in the sidebar tree view. */
  get filterQuery(): string {
    return this.filter;
  }

  /** Applies a search filter query to the Worktrees tree view. */
  setFilter(query: string): void {
    this.filter = query.trim();
    void vscode.commands.executeCommand('setContext', 'paraSpace.hasSearchFilter', Boolean(this.filter));
    this.updateViewState();
    this.changed.fire();
  }

  /** Clears any active search filter on the Worktrees tree view. */
  clearFilter(): void {
    this.setFilter('');
  }

  private updateViewState(): void {
    this.view.description = this.filter ? `Filter: "${this.filter}"` : undefined;
    if (this.store.error) {
      this.view.message = `Errors: ${this.store.error}`;
      return;
    }
    if (this.filter) {
      const { workspaces, repos } = filterTreeData(
        this.store.workspaces,
        this.store.repos,
        this.store.allRows,
        this.filter,
      );
      this.view.message =
        workspaces.length === 0 && repos.length === 0 ? `No ParaSpaces matching "${this.filter}".` : undefined;
      return;
    }
    this.view.message = undefined;
  }

  getTreeItem(node: WorktreeTreeNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: WorktreeTreeNode): WorktreeTreeNode[] {
    const current = this.store.current;
    if (!node) {
      const { workspaces, repos } = filterTreeData(
        this.store.workspaces,
        this.store.repos,
        this.store.allRows,
        this.filter,
      );
      const nodes: WorktreeTreeNode[] = [];
      if (workspaces.length > 0) {
        nodes.push(...workspaces.map((ws) => new WorkspaceNode(ws, ws.id === this.store.currentWorkspace?.id)));
      }
      if (this.store.repos.length <= 1) {
        const rows = repos[0]?.rows ?? [];
        nodes.push(...rows.map((r) => new WorktreeNode(r, r.path === current?.path, this.store.root)));
      } else {
        nodes.push(...repos.map((repo) => new RepoNode(repo)));
      }
      return nodes;
    }
    if (node instanceof WorkspaceNode) {
      return node.workspace.repos.map((repo) => {
        const found = this.store.allRows.find((r) => path.resolve(r.path) === path.resolve(repo.worktreePath));
        const info: WorktreeInfo = found ?? {
          name: path.basename(repo.worktreePath),
          path: repo.worktreePath,
          branch: node.workspace.branch,
          isMain: false,
          dirty: 0,
          depsMode: 'Symlinked',
          managed: true,
        };
        return new WorktreeNode(info, info.path === current?.path, repo.root);
      });
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
