import * as vscode from 'vscode';
import { action } from '../runtime.js';
import { selectRepositoriesPrompt } from '../workspace.js';
import type { CommandContext } from './context.js';

/**
 * `paraSpace.selectRepositories`: allows the user to check which repositories in the workspace
 * are managed by ParaSpace, and uncheck any they wish to remove/exclude.
 */
export function registerSelectRepositories({ rt, store, extensionContext }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.selectRepositories',
    action(rt, async () => {
      await selectRepositoriesPrompt(extensionContext, () => void store.load());
    }),
  );
}
