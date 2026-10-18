import fs from 'node:fs';
import { ledgerPath } from '@para-space/core';
import * as vscode from 'vscode';
import { action, pick } from '../runtime.js';
import { requireActiveRepoRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

/** Registers commands for opening context history. */
export function registerLedgerCommands({ rt, store }: CommandContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'paraSpace.openLedgerFile',
      action(rt, async (target?: unknown) => {
        let root: string | undefined;
        if (target && typeof target === 'object') {
          const t = target as { repo?: { root: string }; repoRoot?: string };
          root = t.repo?.root ?? t.repoRoot;
        }

        if (!root) {
          if (store.repos.length > 1) {
            const picked = await pick(
              store.repos.map((r) => ({ label: r.name, description: r.root, root: r.root })),
              { title: 'ParaSpace: Open Context History', placeHolder: 'Select repository' },
            );
            root = picked.root;
          } else {
            root = store.root ?? requireActiveRepoRoot(store.roots);
          }
        }

        const file = ledgerPath(root);
        if (!fs.existsSync(file)) {
          void vscode.window.showInformationMessage(
            'No context history file (.para-space/context-history.md) found yet.',
          );
          return;
        }
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
      }),
    ),
  ];
}
