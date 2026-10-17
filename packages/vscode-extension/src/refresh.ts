import { statePath } from '@para-space/core';
import path from 'node:path';
import * as vscode from 'vscode';
import type { WorktreeStore } from './store.js';
import { findWorkspaceRoot } from './workspace.js';

const DEBOUNCE_MS = 300;

/**
 * Reloads the store (debounced) when something outside the extension may have changed the
 * worktrees: `state.json` written by the CLI or an agent, workspace folders changing, the window
 * regaining focus (covers plain `git worktree` commands run in a terminal), or the active editor
 * moving to another repo in a multi-root workspace.
 */
export function watchForChanges(store: WorktreeStore): vscode.Disposable[] {
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void store.load(), DEBOUNCE_MS);
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
    vscode.window.onDidChangeActiveTextEditor(() => findWorkspaceRoot() !== store.root && schedule()),
    { dispose: () => clearTimeout(timer) },
  ];
}
