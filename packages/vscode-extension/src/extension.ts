import * as vscode from 'vscode';
import { registerCommands } from './commands.js';
import { watchForChanges } from './refresh.js';
import { createRuntime } from './runtime.js';
import { WorktreeTreeProvider } from './tree.js';

/** Entry point: VS Code calls this when the ParaSpace view opens or a ParaSpace command first runs. */
export function activate(context: vscode.ExtensionContext): void {
  const rt = createRuntime();
  const tree = new WorktreeTreeProvider(rt.log);
  tree.view = vscode.window.createTreeView('paraSpace.worktrees', { treeDataProvider: tree });

  context.subscriptions.push(
    rt.output,
    tree,
    tree.view,
    ...registerCommands(rt, tree),
    ...watchForChanges(() => tree.refresh()),
  );
}

export function deactivate(): void {}
