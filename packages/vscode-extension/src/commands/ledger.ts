import fs from 'node:fs';
import { ledgerPath } from '@para-space/core';
import * as vscode from 'vscode';
import { action } from '../runtime.js';
import { requireWorkspaceRoot } from '../workspace.js';
import type { CommandContext } from './context.js';

/** Registers commands for opening context history. */
export function registerLedgerCommands({ rt, store }: CommandContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'paraSpace.openLedgerFile',
      action(rt, async () => {
        const root = store.root ?? requireWorkspaceRoot();
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
