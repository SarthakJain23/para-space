import * as vscode from 'vscode';
import type { Runtime } from '../runtime.js';
import type { WorktreeStore } from '../store.js';

/** What every command module receives from `extension.ts`. */
export interface CommandContext {
  rt: Runtime;
  /** Call `store.load()` after a change so the tree and status bar update. */
  store: WorktreeStore;
}

/** Open a worktree folder in a new VS Code window. */
export function openInNewWindow(path: string): Thenable<unknown> {
  return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), { forceNewWindow: true });
}
