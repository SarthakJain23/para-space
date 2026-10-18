import * as vscode from 'vscode';
import { isInside } from '../dialogs.js';
import { CREATE_ITEM, switcherItems } from '../items.js';
import { action, pick } from '../runtime.js';
import type { WorktreeNode } from '../tree.js';
import { requireActiveRepoRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

/**
 * `paraSpace.listWorktrees`: the worktree switcher (also opened from the status bar).
 * "Create Worktree…" first, then every worktree with the current one checked; picking
 * another worktree opens it in a new window.
 */
export function registerList({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.listWorktrees',
    action(rt, async () => {
      requireActiveRepoRoot(store.roots);
      await store.load();
      if (store.error) throw new Error(store.error);
      const isMultiRepo = store.repos.length > 1;
      const repoNameForPath = isMultiRepo
        ? (p: string) => store.repos.find((r) => isInside(p, r.root))?.name
        : undefined;
      const rows = isMultiRepo ? store.allRows : store.rows;
      const picked = await pick(switcherItems(rows, store.current, repoNameForPath), {
        title: 'ParaSpace Worktrees',
        placeHolder: 'Switch to a worktree (opens in a new window)',
        matchOnDescription: true,
      });
      if (picked === CREATE_ITEM) await vscode.commands.executeCommand('paraSpace.createWorktree');
      else if (picked.path && !picked.current) await openInNewWindow(picked.path);
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
export function registerRefresh({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.refresh',
    action(rt, () => store.load()),
  );
}
