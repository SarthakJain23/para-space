import path from 'node:path';
import { removeWorkspaceCascade, removeWorktree } from '@para-space/core';
import * as vscode from 'vscode';
import { isInside, removeDialog, removeWorkspaceDialog } from '../dialogs.js';
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

/** `paraSpace.removeWorkspace`: removes a multi-repo workspace and optionally its member worktrees and branches. */
export function registerRemoveWorkspace({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.removeWorkspace',
    action(rt, async ({ workspace }: WorkspaceNode) => {
      const dirtyRepos = workspace.repos.flatMap((member) => {
        const row = store.allRows.find((r) => path.resolve(r.path) === path.resolve(member.worktreePath));
        return row && row.dirty > 0 ? [{ name: member.name, dirty: row.dirty }] : [];
      });
      const { message, detail, choices } = removeWorkspaceDialog(workspace, dirtyRepos);
      const picked = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        ...choices.map((c) => c.label),
      );
      const choice = choices.find((c) => c.label === picked);
      if (!choice) return;

      if (choice.removeWorktrees) {
        const openFolders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
        const openMember = workspace.repos.find((m) => openFolders.some((f) => isInside(f, m.worktreePath)));
        if (openMember) {
          throw new Error(
            `This window has ${openMember.name} (${openMember.worktreePath}) open. Remove it from another window.`,
          );
        }
      }

      const { removedWorktrees, errors } = await withProgress(`Removing workspace ${workspace.name}…`, () =>
        removeWorkspaceCascade({
          workspace,
          removeWorktrees: choice.removeWorktrees,
          deleteWorkspaceFile: choice.deleteWorkspaceFile,
          deleteBranch: choice.deleteBranch,
          force: choice.force,
          log: rt.log,
        }),
      );
      await store.load();
      if (errors.length > 0) {
        vscode.window.showWarningMessage(
          `Partially removed ${workspace.name} (${removedWorktrees.length} worktree(s) removed). Errors: ${errors.join('; ')}`,
        );
      } else {
        const wtSuffix = choice.removeWorktrees ? ` and ${removedWorktrees.length} worktree(s)` : '';
        vscode.window.showInformationMessage(`Removed workspace ${workspace.name}${wtSuffix}.`);
      }
    }),
  );
}
