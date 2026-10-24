import { isolateWorktree } from '@para-space/core';
import * as vscode from 'vscode';
import { action, ask, withProgress } from '../runtime.js';
import type { WorktreeNode } from '../tree.js';
import { requireWorkspaceRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

/** `paraSpace.isolateWorktree`: row action; confirms, asks an optional reason, runs core's `isolateWorktree`. */
export function registerIsolate({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.isolateWorktree',
    action(rt, async ({ info, repoRoot }: WorktreeNode) => {
      const go = 'Isolate';
      const answer = await vscode.window.showWarningMessage(
        `Isolate dependencies of ${info.name}?`,
        {
          modal: true,
          detail:
            "Replaces the shared node_modules / .venv links with this worktree's own copy, so installs here no longer affect the main repo. This may run a package install.",
        },
        go,
      );
      if (answer !== go) return;
      const reason =
        (
          await ask({
            title: 'ParaSpace: Isolate Dependencies',
            prompt: 'Why? Optional, recorded in the context ledger',
            placeHolder: 'Upgrading React',
          })
        ).trim() || undefined;

      const cwd = repoRoot ?? store.root ?? requireWorkspaceRoot();
      const res = await withProgress(`Isolating dependencies of ${info.name}…`, () =>
        isolateWorktree({ cwd, target: info.path, reason, log: rt.log }),
      );
      void store.load();
      vscode.window.showInformationMessage(
        res.isolated.length
          ? `${info.name} now has its own dependencies (${res.isolated.join(', ')}).`
          : `Nothing to isolate: ${info.name} does not share dependencies.`,
      );
    }),
  );
}
