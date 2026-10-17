import * as vscode from 'vscode';

/** The repo ParaSpace works on: the active editor's workspace folder, else the first one. */
export function findWorkspaceRoot(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  const folder = editor
    ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
    : vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

/** Like `findWorkspaceRoot`, but throws a user-facing error when no folder is open. */
export function requireWorkspaceRoot(): string {
  const root = findWorkspaceRoot();
  if (!root) throw new Error('Open a folder inside a git repository first.');
  return root;
}
