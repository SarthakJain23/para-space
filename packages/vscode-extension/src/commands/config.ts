import { updateConfig } from '@para-space/core';
import * as vscode from 'vscode';
import { vscodePrompter } from '../prompter.js';
import { action, ask, pick, withProgress } from '../runtime.js';
import { requireActiveRepoRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

const TITLE = 'ParaSpace: Configure Port Strategy';

/**
 * `paraSpace.configureRepo`: interactive prompt to configure or update the repo's
 * port strategy and settings in `.para-space.json`, recording the change in the context ledger.
 */
export function registerConfigure({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.configureRepo',
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
            { title: TITLE, placeHolder: 'Select repository to configure' },
          );
          cwd = picked.root;
        } else {
          cwd = requireActiveRepoRoot(store.roots);
        }
      }

      const requirement =
        (
          await ask({
            title: TITLE,
            prompt: 'Reason for configuration change? Optional, recorded in context ledger',
            placeHolder: 'Switching to free port scan for microservices',
          })
        ).trim() || undefined;

      const res = await withProgress('Updating port strategy…', () =>
        updateConfig({ cwd, prompter: vscodePrompter, reason: requirement, log: rt.log }),
      );
      void store.load();

      await vscode.window.showInformationMessage(
        `ParaSpace configured: ${res.config.portStrategy} strategy (base port ${res.config.basePort}).`,
      );
    }),
  );
}
