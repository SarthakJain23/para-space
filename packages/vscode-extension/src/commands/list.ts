import { listWorktrees } from '@para-space/core';
import * as vscode from 'vscode';
import { toWorktreeItem } from '../items.js';
import { action, pick } from '../runtime.js';
import type { WorktreeNode } from '../tree.js';
import { requireWorkspaceRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

/** `paraSpace.listWorktrees`: quick pick of all worktrees; the chosen one opens in a new window. */
export function registerList({ rt }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.listWorktrees',
    action(rt, async () => {
      const rows = await listWorktrees({ cwd: requireWorkspaceRoot(), log: rt.log });
      const picked = await pick(rows.map(toWorktreeItem), {
        title: 'ParaSpace Worktrees',
        placeHolder: 'Select a worktree to open in a new window',
        matchOnDescription: true,
      });
      await openInNewWindow(picked.path);
    }),
  );
}

/** `paraSpace.openInNewWindow`: row action in the tree. */
export function registerOpen({ rt }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.openInNewWindow',
    action(rt, async (node: WorktreeNode) => {
      await openInNewWindow(node.info.path);
    }),
  );
}

/** `paraSpace.refresh`: the ↻ button in the view title. */
export function registerRefresh({ rt, tree }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.refresh',
    action(rt, async () => tree.refresh()),
  );
}
