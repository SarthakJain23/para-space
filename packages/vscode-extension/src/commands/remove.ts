import { removeWorkspaceRecord, removeWorktree } from '@para-space/core';
import * as vscode from 'vscode';
import { isInside, removeDialog } from '../dialogs.js';
import { action, withProgress } from '../runtime.js';
import type { WorkspaceNode, WorktreeNode } from '../tree.js';
import { requireWorkspaceRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

/** `paraSpace.removeWorktree`: row action; confirms (force if dirty, optional branch delete), runs core's `removeWorktree`. */
export function registerRemove({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.removeWorktree',
    action(rt, async ({ info, repoRoot }: WorktreeNode) => {
      const openFolders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
      if (openFolders.some((f) => isInside(f, info.path))) {
        throw new Error(`This window has ${info.name} open. Remove it from another window.`);
      }
      const cwd = repoRoot ?? store.root ?? requireWorkspaceRoot();
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

/** `paraSpace.removeWorkspace`: removes a workspace record, optionally moving its file to Trash. */
export function registerRemoveWorkspace({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.removeWorkspace',
    action(rt, async ({ workspace }: WorkspaceNode) => {
      const deleteChoice = 'Move File to Trash & Remove';
      const picked = await vscode.window.showWarningMessage(
        `Remove workspace ${workspace.name} from ParaSpace?`,
        { modal: true, detail: 'You can keep the .code-workspace file or move it to Trash as well.' },
        'Remove from ParaSpace',
        deleteChoice,
      );
      if (!picked) return;

      if (picked === deleteChoice) {
        await vscode.workspace.fs.delete(vscode.Uri.file(workspace.workspaceFile), { useTrash: true });
      }
      await removeWorkspaceRecord(workspace.workspaceFile, picked !== deleteChoice);
      await store.load();
      vscode.window.showInformationMessage(
        picked === deleteChoice
          ? `Removed workspace ${workspace.name} and moved its file to Trash.`
          : `Removed workspace ${workspace.name} from ParaSpace.`,
      );
    }),
  );
}
