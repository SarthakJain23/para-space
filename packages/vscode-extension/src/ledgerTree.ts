import { type LedgerEntry, readLedger } from '@para-space/core';
import * as vscode from 'vscode';
import { formatLedgerDate, type LedgerDetailItem, ledgerTooltip, toLedgerDetails } from './items.js';
import type { WorktreeStore } from './store.js';

export class LedgerEntryNode extends vscode.TreeItem {
  constructor(readonly entry: LedgerEntry) {
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

export type LedgerNode = LedgerEntryNode | LedgerDetailNode;

/**
 * Tree provider for the `paraSpace.ledger` view (Context History).
 * Renders timestamped ADR ledger entries recorded in `<mainRoot>/.para-space/context-history.md`.
 */
export class LedgerTreeProvider implements vscode.TreeDataProvider<LedgerNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<LedgerNode>;
  private readonly subscription: vscode.Disposable;
  private entries: LedgerEntry[] = [];

  constructor(private readonly store: WorktreeStore) {
    this.view = vscode.window.createTreeView('paraSpace.ledger', { treeDataProvider: this });
    this.subscription = store.onDidChange(() => {
      void this.reload();
    });
    void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.store.root) {
      this.entries = [];
      this.changed.fire();
      return;
    }
    try {
      const all = await readLedger(this.store.root);
      // Newest first for developer context
      this.entries = [...all].reverse();
      this.view.description = this.entries.length ? `${this.entries.length} entries` : undefined;
    } catch {
      this.entries = [];
    }
    this.changed.fire();
  }

  getTreeItem(node: LedgerNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: LedgerNode): LedgerNode[] {
    if (!node) {
      return this.entries.map((e) => new LedgerEntryNode(e));
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
