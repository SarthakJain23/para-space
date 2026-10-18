import { type LedgerEntry, readLedger } from '@para-space/core';
import * as vscode from 'vscode';
import { formatLedgerDate, type LedgerDetailItem, ledgerTooltip, toLedgerDetails } from './items.js';
import type { RepoWorktrees, WorktreeStore } from './store.js';

export class RepoLedgerNode extends vscode.TreeItem {
  constructor(
    readonly repo: RepoWorktrees,
    entryCount: number,
  ) {
    super(repo.name, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${entryCount} entries`;
    this.tooltip = repo.root;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'paraSpace.repoLedger';
  }
}

export class LedgerEntryNode extends vscode.TreeItem {
  constructor(
    readonly entry: LedgerEntry,
    readonly repoRoot?: string,
  ) {
    super(entry.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = formatLedgerDate(entry.date);
    this.tooltip = ledgerTooltip(entry);
    this.iconPath = new vscode.ThemeIcon('book');
    this.contextValue = 'ledger.entry';
  }
}

export class LedgerDetailNode extends vscode.TreeItem {
  constructor(readonly detail: LedgerDetailItem) {
    super(detail.label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = detail.tooltip;
    this.iconPath = new vscode.ThemeIcon(detail.icon);
    this.contextValue = `ledger.detail.${detail.kind}`;
  }
}

export type LedgerNode = RepoLedgerNode | LedgerEntryNode | LedgerDetailNode;

/**
 * Tree provider for the `paraSpace.ledger` view (Context History).
 * Renders timestamped ADR ledger entries recorded across repositories.
 */
export class LedgerTreeProvider implements vscode.TreeDataProvider<LedgerNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<LedgerNode>;
  private readonly subscription: vscode.Disposable;
  private entriesByRepo = new Map<string, LedgerEntry[]>();

  constructor(private readonly store: WorktreeStore) {
    this.view = vscode.window.createTreeView('paraSpace.ledger', { treeDataProvider: this });
    this.subscription = store.onDidChange(() => {
      void this.reload();
    });
    void this.reload();
  }

  async reload(): Promise<void> {
    this.entriesByRepo.clear();
    for (const repo of this.store.repos) {
      try {
        const all = await readLedger(repo.root);
        this.entriesByRepo.set(repo.root, [...all].reverse());
      } catch {
        this.entriesByRepo.set(repo.root, []);
      }
    }
    const total = [...this.entriesByRepo.values()].reduce((sum, e) => sum + e.length, 0);
    this.view.description = total > 0 ? `${total} entries` : undefined;
    this.changed.fire();
  }

  getTreeItem(node: LedgerNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: LedgerNode): LedgerNode[] {
    if (!node) {
      if (this.store.repos.length <= 1) {
        const root = this.store.root;
        const entries = root ? (this.entriesByRepo.get(root) ?? []) : [];
        return entries.map((e) => new LedgerEntryNode(e, root));
      }
      return this.store.repos.map((repo) => {
        const entries = this.entriesByRepo.get(repo.root) ?? [];
        return new RepoLedgerNode(repo, entries.length);
      });
    }
    if (node instanceof RepoLedgerNode) {
      const entries = this.entriesByRepo.get(node.repo.root) ?? [];
      return entries.map((e) => new LedgerEntryNode(e, node.repo.root));
    }
    if (node instanceof LedgerEntryNode) {
      return toLedgerDetails(node.entry).map((d) => new LedgerDetailNode(d));
    }
    return [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.view.dispose();
    this.changed.dispose();
  }
}
