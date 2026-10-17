import { checkDivergence, isolateWorktree, manifestFiles } from '@para-space/core';
import * as vscode from 'vscode';
import { isInside } from './dialogs.js';
import type { Runtime } from './runtime.js';
import { withProgress } from './runtime.js';
import type { WorktreeStore } from './store.js';

const DEBOUNCE_MS = 500;

/**
 * Watches dependency manifests (package.json, lockfiles, requirements.txt, pyproject.toml)
 * in all worktrees. When a symlinked worktree's dependencies diverge from the main repo,
 * displays a warning notification offering one-click breakaway isolation (D-003).
 */
export function watchManifests(store: WorktreeStore, rt: Runtime): vscode.Disposable[] {
  let timer: NodeJS.Timeout | undefined;
  // Keyed by `${worktreePath}:${divergedFiles}` so we only alert once per divergence state
  const alerted = new Set<string>();

  const check = async (changedUri?: vscode.Uri) => {
    if (!store.root) return;

    // Find the affected worktree, or check all symlinked worktrees if uri is not specific
    const targetRows = changedUri
      ? store.rows.filter((r) => !r.isMain && isInside(changedUri.fsPath, r.path))
      : store.rows.filter((r) => !r.isMain);

    for (const row of targetRows) {
      if (row.depsMode !== 'Symlinked') continue;

      const result = await checkDivergence(store.root, row.path);
      const alertKey = `${row.path}:${result.divergedFiles.sort().join(',')}`;

      if (result.diverged) {
        // Trigger a store reload so sidebar tree item reflects divergence
        if (!row.diverged) void store.load();

        if (alerted.has(alertKey)) continue;
        alerted.add(alertKey);

        const isolateAction = 'Isolate Dependencies';
        const ignoreAction = 'Ignore';
        const fileList = result.divergedFiles.join(', ');
        const choice = await vscode.window.showWarningMessage(
          `Dependencies in worktree "${row.branch ?? row.name}" have diverged from main (${fileList}). Installing packages here may alter the shared environment.`,
          isolateAction,
          ignoreAction,
        );

        if (choice === isolateAction) {
          try {
            await withProgress(`Isolating dependencies for ${row.branch ?? row.name}…`, () =>
              isolateWorktree({
                cwd: store.root!,
                target: row.branch ?? row.name,
                reason: `Manifest divergence detected: ${fileList}`,
                log: rt.log,
              }),
            );
            alerted.delete(alertKey);
            await store.load();
            void vscode.window.showInformationMessage(
              `Dependencies isolated for "${row.branch ?? row.name}". Packages are now independent.`,
            );
          } catch (err) {
            void vscode.window.showErrorMessage(`Failed to isolate worktree: ${(err as Error).message}`);
          }
        }
      } else {
        alerted.delete(alertKey);
        if (row.diverged) void store.load();
      }
    }
  };

  const schedule = (uri?: vscode.Uri) => {
    clearTimeout(timer);
    timer = setTimeout(() => void check(uri), DEBOUNCE_MS);
  };

  const pattern = `**/{${manifestFiles().join(',')}}`;
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  return [
    watcher,
    watcher.onDidCreate((uri) => schedule(uri)),
    watcher.onDidChange((uri) => schedule(uri)),
    watcher.onDidDelete((uri) => schedule(uri)),
    { dispose: () => clearTimeout(timer) },
  ];
}
