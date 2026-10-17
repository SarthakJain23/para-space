import * as vscode from 'vscode';
import { registerCommands } from './commands/index.js';
import { LedgerTreeProvider } from './ledgerTree.js';
import { watchForChanges } from './refresh.js';
import { createRuntime } from './runtime.js';
import { createStatusBar } from './statusbar.js';
import { WorktreeStore } from './store.js';
import { WorktreeTreeProvider } from './tree.js';

/** Entry point: VS Code calls this once startup has finished (for the status bar), or earlier on first use. */
export function activate(context: vscode.ExtensionContext): void {
  const rt = createRuntime();
  const store = new WorktreeStore(rt.log);
  const worktreeTree = new WorktreeTreeProvider(store);
  const ledgerTree = new LedgerTreeProvider(store);

  context.subscriptions.push(
    rt.output,
    store,
    worktreeTree,
    ledgerTree,
    createStatusBar(store),
    ...registerCommands({ rt, store }),
    ...watchForChanges(store),
  );
  void store.load();
}

export function deactivate(): void {}
