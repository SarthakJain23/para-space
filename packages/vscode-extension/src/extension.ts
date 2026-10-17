import { type Logger, listWorktrees } from '@para-space/core';
import * as vscode from 'vscode';
import { toWorktreeItem } from './items.js';

/** Entry point: VS Code calls this the first time a ParaSpace command runs. */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ParaSpace');
  const log: Logger = {
    info: (m) => output.appendLine(m),
    warn: (m) => output.appendLine(`warning: ${m}`),
  };

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('paraSpace.listWorktrees', () => run(output, () => pickAndOpenWorktree(log))),
  );
}

export function deactivate(): void {}

/** Show the repo's worktrees; open the chosen one in a new window. */
async function pickAndOpenWorktree(log: Logger): Promise<void> {
  const cwd = workspaceRoot();
  const rows = await listWorktrees({ cwd, log });
  const picked = await vscode.window.showQuickPick(rows.map(toWorktreeItem), {
    title: 'ParaSpace Worktrees',
    placeHolder: 'Select a worktree to open in a new window',
    matchOnDescription: true,
  });
  if (picked) {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(picked.path), { forceNewWindow: true });
  }
}

function workspaceRoot(): string {
  const folder = vscode.window.activeTextEditor
    ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    : vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Open a folder inside a git repository first.');
  return folder.uri.fsPath;
}

/** Same role as the CLI's `action()`: surface errors to the user instead of failing silently. */
async function run(output: vscode.OutputChannel, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = (err as Error).message;
    output.appendLine(`error: ${message}`);
    vscode.window.showErrorMessage(`ParaSpace: ${message}`);
  }
}
