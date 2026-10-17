import path from 'node:path';
import { createWorktree, listBranches } from '@para-space/core';
import * as vscode from 'vscode';
import { validateBranchName } from '../dialogs.js';
import { vscodePrompter } from '../prompter.js';
import { action, ask, pick, withProgress } from '../runtime.js';
import { requireWorkspaceRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

const TITLE = 'ParaSpace: Create Worktree';

/**
 * `paraSpace.createWorktree`: asks for branch, base (only for a new branch) and an optional
 * reason, then runs core's `createWorktree` with editor dialogs as the prompter.
 */
export function registerCreate({ rt, tree }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.createWorktree',
    action(rt, async () => {
      const cwd = requireWorkspaceRoot();
      const branches = await listBranches({ cwd });

      const branch = (
        await ask({
          title: TITLE,
          prompt: 'Branch name (new or existing)',
          placeHolder: 'feat/TK-101',
          validateInput: validateBranchName,
        })
      ).trim();
      const base = branches.includes(branch)
        ? undefined
        : (
            await pick(
              branches.map((b) => ({ label: b })),
              { title: TITLE, placeHolder: `Base branch for new branch ${branch}` },
            )
          ).label;
      const requirement =
        (
          await ask({
            title: TITLE,
            prompt: 'Why does this worktree exist? Optional, recorded in the context ledger',
            placeHolder: 'Auth redesign',
          })
        ).trim() || undefined;

      const res = await withProgress(`Creating worktree ${branch}…`, () =>
        createWorktree({ cwd, branch, base, requirement, prompter: vscodePrompter, ide: 'ask', log: rt.log }),
      );
      tree.refresh();

      const open = 'Open in New Window';
      const port = res.port !== undefined ? ` on port ${res.port}` : '';
      const answer = await vscode.window.showInformationMessage(
        `Worktree ready: ${path.basename(res.path)}${port}`,
        open,
      );
      if (answer === open) await openInNewWindow(res.path);
    }),
  );
}
