import path from 'node:path';
import {
  discoverWorkspaceRepoRoots,
  findWorkspaceConfigFile,
  getWorkspaceRecords,
  mainRepoRoot,
} from '@para-space/core';
import * as vscode from 'vscode';
import { isInside } from './dialogs.js';

export const EXCLUDED_REPOS_KEY = 'paraSpace.excludedRepos';

/**
 * Discovers all unique Git repository roots across open workspace folders.
 * Checks each folder directly as a git repo, or scans subdirectories/workspace files if it is a container folder.
 */
export async function discoverRepoRoots(): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const isMultiFolderOrWorkspaceFile = Boolean(vscode.workspace.workspaceFile) || folders.length > 1;
  const roots = new Set<string>();
  for (const f of folders) {
    try {
      const root = await mainRepoRoot(f.uri.fsPath);
      roots.add(root);
      const parentDir = path.dirname(root);
      if (isMultiFolderOrWorkspaceFile || (await findWorkspaceConfigFile(parentDir))) {
        const siblingRoots = await discoverWorkspaceRepoRoots(parentDir);
        for (const r of siblingRoots) roots.add(r);
      }
    } catch {
      try {
        const subRoots = await discoverWorkspaceRepoRoots(f.uri.fsPath);
        for (const r of subRoots) roots.add(r);
      } catch {
        // ignore
      }
    }
  }
  if (roots.size > 0) {
    try {
      const workspaces = await getWorkspaceRecords([...roots]);
      for (const ws of workspaces) {
        for (const repo of ws.repos) {
          roots.add(repo.root);
          const siblingRoots = await discoverWorkspaceRepoRoots(path.dirname(repo.root));
          for (const r of siblingRoots) roots.add(r);
        }
      }
    } catch {
      // ignore
    }
  }
  return [...roots];
}

/**
 * Returns all repository roots included by the user in this workspace.
 * By default, all discovered repositories in the workspace are selected.
 */
export async function getIncludedRepoRoots(state?: vscode.Memento): Promise<string[]> {
  const allRepos = await discoverRepoRoots();
  if (!state) return allRepos;
  const excluded = new Set(state.get<string[]>(EXCLUDED_REPOS_KEY) ?? []);
  return allRepos.filter((r) => !excluded.has(r));
}

/**
 * Prompts the user to select which repositories in the workspace to include or remove.
 * By default all are checked.
 */
export async function selectRepositoriesPrompt(context: vscode.ExtensionContext, onChanged: () => void): Promise<void> {
  const allRepos = await discoverRepoRoots();
  if (allRepos.length === 0) {
    void vscode.window.showInformationMessage('No Git repositories found in the current workspace.');
    return;
  }
  const excluded = new Set(context.workspaceState.get<string[]>(EXCLUDED_REPOS_KEY) ?? []);
  const items = allRepos.map((root) => ({
    label: path.basename(root),
    description: root,
    picked: !excluded.has(root),
    root,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'ParaSpace: Select Repositories to Include',
    placeHolder: 'Check repositories to include in ParaSpace; uncheck to remove',
    canPickMany: true,
  });
  if (!picked) return;

  const pickedRoots = new Set(picked.map((p) => p.root));
  const newExcluded = allRepos.filter((r) => !pickedRoots.has(r));
  await context.workspaceState.update(EXCLUDED_REPOS_KEY, newExcluded);
  onChanged();
}

/** The repo of the active editor, workspace folders, or the first included repo. */
export function findActiveRepoRoot(includedRoots: string[]): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fsPath = editor.document.uri.fsPath;
    const match = includedRoots.find((r) => isInside(fsPath, r));
    if (match) return match;
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const match = includedRoots.find((r) => isInside(folder.uri.fsPath, r));
    if (match) return match;
  }
  return includedRoots[0];
}

/** Like `findActiveRepoRoot`, but throws a user-facing error when no repo is available. */
export function requireActiveRepoRoot(includedRoots: string[]): string {
  const root = findActiveRepoRoot(includedRoots);
  if (!root) throw new Error('Open a folder inside a git repository first.');
  return root;
}

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
