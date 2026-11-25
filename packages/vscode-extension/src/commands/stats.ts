import * as vscode from 'vscode';
import type { CommandContext } from './context.js';

/** Registers the stats dashboard, scope toggle, and refresh commands. */
export function registerStatsCommands({ statsTree, statsWebview }: CommandContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('paraSpace.openStatsDashboard', async () => {
      await statsWebview?.open();
    }),
    vscode.commands.registerCommand('paraSpace.refreshStats', async () => {
      await statsTree?.reload();
    }),
    vscode.commands.registerCommand('paraSpace.toggleStatsScope', async () => {
      await statsTree?.toggleScope();
    }),
  ];
}
