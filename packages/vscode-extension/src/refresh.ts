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
  const stateWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
  );
  const repoWatcher = vscode.workspace.createFileSystemWatcher('**/.para-space/**');
  const configWatcher = vscode.workspace.createFileSystemWatcher('**/.para-space.json');
  return [
    stateWatcher,
    stateWatcher.onDidCreate(schedule),
    stateWatcher.onDidChange(schedule),
    stateWatcher.onDidDelete(schedule),
    repoWatcher,
    repoWatcher.onDidCreate(schedule),
    repoWatcher.onDidChange(schedule),
    repoWatcher.onDidDelete(schedule),
    configWatcher,
    configWatcher.onDidCreate(schedule),
    configWatcher.onDidChange(schedule),
    configWatcher.onDidDelete(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(schedule),
    vscode.window.onDidChangeWindowState((s) => s.focused && schedule()),
    vscode.window.onDidChangeActiveTextEditor(() => findWorkspaceRoot() !== store.root && schedule()),
    { dispose: () => clearTimeout(timer) },
  ];
}
