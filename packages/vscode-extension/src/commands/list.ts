import {
  type WorkspaceRecord,
  getWorkspaceRecords,
  parseWorkspaceFileAsRecord,
  saveWorkspaceRecord,
} from '@para-space/core';
import * as vscode from 'vscode';
import { isInside } from '../dialogs.js';
import { CREATE_ITEM, switcherItems } from '../items.js';
import { action, pick } from '../runtime.js';
import type { WorktreeNode, WorkspaceNode } from '../tree.js';
import { requireActiveRepoRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

/**
 * `paraSpace.listWorktrees`: the worktree switcher (also opened from the status bar).
 * "Create Worktree…" first, then any multi-repo workspaces, then every worktree with
 * the current one checked; picking another worktree or workspace opens it in a new window.
 */
export function registerList({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.listWorktrees',
    action(rt, async () => {
      requireActiveRepoRoot(store.roots);
      await store.load();
      if (store.error) throw new Error(store.error);
      const isMultiRepo = store.repos.length > 1;
      const repoNameForPath = isMultiRepo
        ? (p: string) => store.repos.find((r) => isInside(p, r.root))?.name
        : undefined;
      const rows = isMultiRepo ? store.allRows : store.rows;
      const picked = await pick(
        switcherItems(rows, store.current, repoNameForPath, store.workspaces, store.currentWorkspace),
        {
          title: 'ParaSpace Worktrees & Workspaces',
          placeHolder: 'Switch to a worktree or workspace (opens in a new window)',
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      if (picked === CREATE_ITEM) await vscode.commands.executeCommand('paraSpace.createWorktree');
      else if (picked.path && !picked.current) await openInNewWindow(picked.path);
    }),
  );
}

/** `paraSpace.openInNewWindow`: row action in the tree. */
export function registerOpen({ rt }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.openInNewWindow',
    action(rt, async (node: WorktreeNode | WorkspaceNode | string) => {
      let targetPath: string | undefined;
      if (typeof node === 'string') {
        targetPath = node;
      } else if (node && typeof node === 'object') {
        if ('workspace' in node && typeof (node as { workspace: { workspaceFile: string } }).workspace === 'object') {
          targetPath = (node as { workspace: { workspaceFile: string } }).workspace.workspaceFile;
        } else if ('info' in node && typeof (node as { info: { path: string } }).info === 'object') {
          targetPath = (node as { info: { path: string } }).info.path;
        }
      }
      if (targetPath) {
        await openInNewWindow(targetPath);
      }
    }),
  );
}

/** `paraSpace.openWorkspace`: selects and opens a recorded multi-repository workspace. */
export function registerOpenWorkspace({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.openWorkspace',
    action(rt, async (targetWorkspace?: WorkspaceNode | string) => {
      await store.load();
      if (typeof targetWorkspace === 'string') {
        await openInNewWindow(targetWorkspace);
        return;
      }
      if (
        targetWorkspace &&
        typeof targetWorkspace === 'object' &&
        'workspace' in targetWorkspace &&
        typeof (targetWorkspace as { workspace: { workspaceFile: string } }).workspace === 'object'
      ) {
        await openInNewWindow((targetWorkspace as { workspace: { workspaceFile: string } }).workspace.workspaceFile);
        return;
      }

      const workspaces = store.workspaces.length > 0 ? store.workspaces : await getWorkspaceRecords();

      const BROWSE_LABEL = '$(file-code) Browse for workspace file…';
      const items: (vscode.QuickPickItem & { ws?: WorkspaceRecord; isBrowse?: boolean })[] = [
        ...workspaces.map((ws) => ({
          label: `$(root-folder) ${ws.branch}`,
          description: `${ws.repos.length} repos (${ws.repos.map((r) => r.name).join(', ')})`,
          detail: ws.workspaceFile,
          ws,
        })),
        {
          label: BROWSE_LABEL,
          description: 'Open a .code-workspace file from disk',
          alwaysShow: true,
          isBrowse: true,
        },
      ];

      const picked = await pick(items, {
        title: 'ParaSpace: Open Workspace',
        placeHolder: 'Select a multi-repository workspace or browse for a .code-workspace file',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked.isBrowse) {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'VS Code Workspace': ['code-workspace'] },
          title: 'Select a .code-workspace file to open',
        });
        if (uris && uris[0]) {
          const filePath = uris[0].fsPath;
          const parsed = await parseWorkspaceFileAsRecord(filePath);
          if (parsed) {
            await saveWorkspaceRecord(parsed);
          }
          await openInNewWindow(filePath);
        }
        return;
      }

      if (picked.ws) {
        await openInNewWindow(picked.ws.workspaceFile);
      }
    }),
  );
}

/** `paraSpace.refresh`: the ↻ button in the view title. */
export function registerRefresh({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.refresh',
    action(rt, () => store.load()),
  );
}
