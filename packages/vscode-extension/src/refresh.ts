import { statePath } from '@para-space/core';
import path from 'node:path';
import * as vscode from 'vscode';

const DEBOUNCE_MS = 300;

/**
 * Calls `refresh` (debounced) when something outside the view may have changed the worktrees:
 * `state.json` written by the CLI or an agent, workspace folders changing, or the window
 * regaining focus (covers plain `git worktree` commands run in a terminal).
 */
export function watchForChanges(refresh: () => void): vscode.Disposable[] {
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, DEBOUNCE_MS);
  };

  const file = statePath();
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
  );
  return [
    watcher,
    watcher.onDidCreate(schedule),
    watcher.onDidChange(schedule),
    watcher.onDidDelete(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(schedule),
    vscode.window.onDidChangeWindowState((s) => s.focused && schedule()),
    { dispose: () => clearTimeout(timer) },
  ];
}
