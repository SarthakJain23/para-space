import { removeWorktree } from '@para-space/core';
import * as vscode from 'vscode';
import { isInside, removeDialog } from '../dialogs.js';
import { action, withProgress } from '../runtime.js';
import type { WorktreeNode } from '../tree.js';
import { requireWorkspaceRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

/** `paraSpace.removeWorktree`: row action; confirms (force if dirty, optional branch delete), runs core's `removeWorktree`. */
export function registerRemove({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.removeWorktree',
    action(rt, async ({ info }: WorktreeNode) => {
      const cwd = requireWorkspaceRoot();
      if (isInside(cwd, info.path)) {
        throw new Error(`This window has ${info.name} open. Remove it from another window.`);
      }
      const { message, detail, choices } = removeDialog(info);
      const picked = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        ...choices.map((c) => c.label),
      );
      const choice = choices.find((c) => c.label === picked);
      if (!choice) return;

      const res = await withProgress(`Removing ${info.name}…`, () =>
        removeWorktree({ cwd, target: info.path, force: choice.force, deleteBranch: choice.deleteBranch, log: rt.log }),
      );
      void store.load();
      if (choice.deleteBranch && !res.branchDeleted) {
        vscode.window.showWarningMessage(
          `Removed ${info.name}. Branch ${res.branch} was kept: it is not fully merged.`,
        );
      } else {
        vscode.window.showInformationMessage(
          `Removed ${info.name}${res.branchDeleted ? ` and branch ${res.branch}` : ''}.`,
        );
      }
    }),
  );
}
