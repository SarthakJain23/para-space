import { listWorktrees } from '@para-space/core';
import * as vscode from 'vscode';
import { toWorktreeItem } from './items.js';
import { type Runtime, action } from './runtime.js';
import type { WorktreeNode, WorktreeTreeProvider } from './tree.js';
import { requireWorkspaceRoot } from './workspace.js';

/** Open a worktree folder in a new VS Code window. */
function openInNewWindow(path: string): Thenable<unknown> {
  return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), { forceNewWindow: true });
}

/** Register every `paraSpace.*` command declared in package.json. */
export function registerCommands(rt: Runtime, tree: WorktreeTreeProvider): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'paraSpace.listWorktrees',
      action(rt, async () => {
        const rows = await listWorktrees({ cwd: requireWorkspaceRoot(), log: rt.log });
        const picked = await vscode.window.showQuickPick(rows.map(toWorktreeItem), {
          title: 'ParaSpace Worktrees',
          placeHolder: 'Select a worktree to open in a new window',
          matchOnDescription: true,
        });
        if (picked) await openInNewWindow(picked.path);
      }),
    ),
    vscode.commands.registerCommand(
      'paraSpace.refresh',
      action(rt, async () => tree.refresh()),
    ),
    vscode.commands.registerCommand(
      'paraSpace.openInNewWindow',
      action(rt, async (node: WorktreeNode) => {
        await openInNewWindow(node.info.path);
      }),
    ),
  ];
}
