import crypto from 'node:crypto';
import path from 'node:path';
import type { ParaSpaceStats, StatsScope } from '@para-space/core';
import * as vscode from 'vscode';
import { openInNewWindow } from './commands/context.js';
import type { StatsTreeProvider } from './statsTree.js';
import { renderStatsDashboardHtml } from './statsWebviewHtml.js';

interface WebviewMessage {
  type: 'setScope' | 'refresh' | 'openWorktree' | 'isolateWorktree';
  scope?: StatsScope;
  path?: string;
  repoRoot?: string;
}

/**
 * Manages the singleton ParaSpace Stats Webview Dashboard panel.
 * Reuses `StatsTreeProvider` snapshots and stays live-synced with worktree and scope changes (D-055).
 */
export class StatsWebviewManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly sub: vscode.Disposable;

  constructor(private readonly statsTree: StatsTreeProvider) {
    this.sub = statsTree.onDidChangeStats((stats) => {
      if (stats && this.panel) this.render(stats);
    });
  }

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'paraSpace.statsDashboard',
        'ParaSpace Stats',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
        void this.handleMessage(msg);
      });
    }

    if (this.statsTree.latestStats) {
      this.render(this.statsTree.latestStats);
    }
    await this.statsTree.reload();
  }

  dispose(): void {
    this.sub.dispose();
    this.panel?.dispose();
  }

  private render(stats: ParaSpaceStats): void {
    if (!this.panel) return;
    const nonce = crypto.randomBytes(16).toString('base64');
    this.panel.webview.html = renderStatsDashboardHtml(stats, nonce);
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'setScope' && (msg.scope === 'repo' || msg.scope === 'global')) {
      await this.statsTree.setScope(msg.scope);
    } else if (msg.type === 'refresh') {
      await this.statsTree.reload();
    } else if (msg.type === 'openWorktree' && msg.path) {
      await openInNewWindow(msg.path);
    } else if (msg.type === 'isolateWorktree' && msg.path) {
      const wt = this.statsTree.latestStats?.repos.flatMap((r) => r.worktrees).find((w) => w.path === msg.path);
      await vscode.commands.executeCommand('paraSpace.isolateWorktree', {
        info: {
          name: wt?.name ?? path.basename(msg.path),
          path: msg.path,
          branch: wt?.branch,
          isMain: false,
          dirty: wt?.dirty ?? 0,
          depsMode: wt?.depsMode ?? 'Symlinked',
          managed: wt?.managed ?? true,
        },
        repoRoot: msg.repoRoot,
      });
    }
  }
}
