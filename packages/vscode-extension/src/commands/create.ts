import path from 'node:path';
import { createWorktree, listBranches } from '@para-space/core';
import * as vscode from 'vscode';
import { validateBranchName } from '../dialogs.js';
import { vscodePrompter } from '../prompter.js';
import { action, ask, pick, withProgress } from '../runtime.js';
import { requireActiveRepoRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

const TITLE = 'ParaSpace: Create Worktree';

/**
 * `paraSpace.createWorktree`: asks for target repository (if multiple exist and not targeted),
 * branch, base (only for a new branch) and an optional reason, then runs core's `createWorktree`.
 */
export function registerCreate({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.createWorktree',
    action(rt, async (target?: unknown) => {
      let cwd: string | undefined;
      if (target && typeof target === 'object') {
        const t = target as { repo?: { root: string }; repoRoot?: string };
        cwd = t.repo?.root ?? t.repoRoot;
      }

      if (!cwd) {
        if (store.repos.length > 1) {
          const picked = await pick(
            store.repos.map((r) => ({ label: r.name, description: r.root, root: r.root })),
            { title: TITLE, placeHolder: 'Select repository for the new worktree' },
          );
          cwd = picked.root;
        } else {
          cwd = requireActiveRepoRoot(store.roots);
        }
      }

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
      void store.load();

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
