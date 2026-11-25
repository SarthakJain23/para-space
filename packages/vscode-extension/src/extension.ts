import * as vscode from 'vscode';
import { registerCommands } from './commands/index.js';
import { LedgerTreeProvider } from './ledgerTree.js';
import { registerLmTools } from './lmTools.js';
import { watchManifests } from './manifestWatcher.js';
import { watchForChanges } from './refresh.js';
import { createRuntime } from './runtime.js';
import { StatsTreeProvider } from './statsTree.js';
import { StatsWebviewManager } from './statsWebview.js';
import { createStatusBar } from './statusbar.js';
import { WorktreeStore } from './store.js';
import { WorktreeTreeProvider } from './tree.js';

/** Entry point: VS Code calls this once startup has finished (for the status bar), or earlier on first use. */
export function activate(context: vscode.ExtensionContext): void {
  const rt = createRuntime();
  const store = new WorktreeStore(rt.log, context.workspaceState);
  const worktreeTree = new WorktreeTreeProvider(store);
  const ledgerTree = new LedgerTreeProvider(store);
  const statsTree = new StatsTreeProvider(store, rt, context.workspaceState);
  const statsWebview = new StatsWebviewManager(statsTree);

  context.subscriptions.push(
    rt.output,
    store,
    worktreeTree,
    ledgerTree,
    statsTree,
    statsWebview,
    createStatusBar(store, statsTree),
    ...registerCommands({ rt, store, worktreeTree, statsTree, statsWebview, extensionContext: context }),
    ...registerLmTools({ rt, store, statsTree, statsWebview, extensionContext: context }),
    ...watchForChanges(store),
    ...watchManifests(store, rt),
  );
  void store.load();
}

export function deactivate(): void {}
