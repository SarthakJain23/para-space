import { type ParaSpaceStats, type StatsScope, getStats } from '@para-space/core';
import * as vscode from 'vscode';
import type { Runtime } from './runtime.js';
import { type StatsRowModel, type StatsSectionModel, buildStatsSections } from './statsItems.js';
import type { WorktreeStore } from './store.js';

const SCOPE_KEY = 'paraSpace.statsScope';

export class StatsSectionNode extends vscode.TreeItem {
  constructor(readonly section: StatsSectionModel) {
    super(
      section.label,
      section.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.id = `stats.section.${section.id}`;
    this.description = section.description;
    this.iconPath = new vscode.ThemeIcon(section.icon);
    this.contextValue = `stats.section.${section.id}`;
  }
}

export class StatsRowNode extends vscode.TreeItem {
  constructor(readonly row: StatsRowModel) {
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon(row.icon);
    if (row.contextValue) this.contextValue = row.contextValue;
  }
}

export type StatsTreeNode = StatsSectionNode | StatsRowNode;

/**
 * Tree provider for the `paraSpace.stats` sidebar view.
 * Computes stats in two stages (fast counts first, full disk scan asynchronously) and shares
 * the latest snapshot with the status bar and Webview dashboard (D-055).
 */
export class StatsTreeProvider implements vscode.TreeDataProvider<StatsTreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private readonly statsChanged = new vscode.EventEmitter<ParaSpaceStats | undefined>();
  /** Fires whenever a fast or full stats snapshot completes. */
  readonly onDidChangeStats = this.statsChanged.event;

  readonly view: vscode.TreeView<StatsTreeNode>;
  private readonly subscription: vscode.Disposable;
  private sections: StatsSectionModel[] = [];
  private _latestStats: ParaSpaceStats | undefined;
  private _scope: StatsScope;
  private loadSeq = 0;

  constructor(
    private readonly store: WorktreeStore,
    private readonly rt: Runtime,
    private readonly memento?: vscode.Memento,
  ) {
    this._scope = memento?.get<StatsScope>(SCOPE_KEY) ?? 'repo';
    this.view = vscode.window.createTreeView('paraSpace.stats', { treeDataProvider: this });
    this.updateScopeContext();
    this.subscription = store.onDidChange(() => {
      void this.reload();
    });
  }

  get scope(): StatsScope {
    return this._scope;
  }

  get latestStats(): ParaSpaceStats | undefined {
    return this._latestStats;
  }

  async setScope(scope: StatsScope): Promise<void> {
    if (this._scope === scope) return;
    this._scope = scope;
    await this.memento?.update(SCOPE_KEY, scope);
    this.updateScopeContext();
    await this.reload();
  }

  async toggleScope(): Promise<void> {
    await this.setScope(this._scope === 'repo' ? 'global' : 'repo');
  }

  async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    const cwd = this.store.root ?? this.store.roots[0] ?? process.cwd();
    const repoRoots = this._scope === 'repo' && this.store.roots.length > 0 ? this.store.roots : undefined;

    try {
      // Fast pass: render live overview & lifetime counters immediately without blocking on disk scans.
      const fast = await getStats({
        cwd,
        scope: this._scope,
        includeDiskUsage: false,
        repoRoots,
        log: this.rt.log,
      });
      if (seq !== this.loadSeq) return;
      this.applyStats(fast);

      const full = await getStats({
        cwd,
        scope: this._scope,
        includeDiskUsage: true,
        repoRoots,
        log: this.rt.log,
      });
      if (seq !== this.loadSeq) return;
      this.applyStats(full);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.rt.log.warn(`Could not compute ParaSpace stats: ${(err as Error).message}`);
    }
  }

  getTreeItem(node: StatsTreeNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: StatsTreeNode): StatsTreeNode[] {
    if (!node) return this.sections.map((s) => new StatsSectionNode(s));
    if (node instanceof StatsSectionNode) return node.section.children.map((r) => new StatsRowNode(r));
    return [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.view.dispose();
    this.changed.dispose();
    this.statsChanged.dispose();
  }

  private applyStats(stats: ParaSpaceStats): void {
    this._latestStats = stats;
    this.sections = buildStatsSections(stats);
    this.view.description = stats.scope === 'global' ? 'All Repos' : 'Workspace';
    this.changed.fire();
    this.statsChanged.fire(stats);
  }

  private updateScopeContext(): void {
    void vscode.commands.executeCommand('setContext', 'paraSpace.statsScope', this._scope);
    this.view.description = this._scope === 'global' ? 'All Repos' : 'Workspace';
  }
}
