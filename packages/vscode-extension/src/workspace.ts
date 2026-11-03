import path from 'node:path';
import { discoverWorkspaceRepoRoots, mainRepoRoot } from '@para-space/core';
import * as vscode from 'vscode';
import { isInside } from './dialogs.js';

export const EXCLUDED_REPOS_KEY = 'paraSpace.excludedRepos';
export const INCLUDED_REPOS_KEY = 'paraSpace.includedRepos';

/**
 * Discovers all unique Git repository roots across open workspace folders.
 * Checks each folder directly as a git repo, or scans subdirectories/workspace files only if it is a non-git container folder.
 */
export async function discoverRepoRoots(): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const roots = new Set<string>();
  for (const f of folders) {
    try {
      const root = await mainRepoRoot(f.uri.fsPath);
      roots.add(path.resolve(root));
    } catch {
      try {
        const subRoots = await discoverWorkspaceRepoRoots(f.uri.fsPath);
        for (const r of subRoots) roots.add(path.resolve(r));
      } catch {
        // ignore
      }
    }
  }
  return [...roots];
}

/**
 * Discovers sibling Git repository roots in the parent directories of `openRoots`
 * that are not already open in the current workspace.
 */
export async function discoverSiblingRepoRoots(openRoots: string[]): Promise<string[]> {
  const openSet = new Set(openRoots.map((r) => path.resolve(r)));
  const parentDirs = new Set(openRoots.map((r) => path.dirname(path.resolve(r))));
  const siblings = new Set<string>();
  for (const dir of parentDirs) {
    try {
      const discovered = await discoverWorkspaceRepoRoots(dir);
      for (const r of discovered) {
        const resolved = path.resolve(r);
        if (!openSet.has(resolved)) {
          siblings.add(resolved);
        }
      }
    } catch {
      // ignore
    }
  }
  return [...siblings];
}

/**
 * Returns all repository roots included by the user in this workspace.
 * By default, only repositories opened in the workspace are included; sibling repositories
 * are included only when explicitly checked in `Select Repositories to Include…`.
 */
export async function getIncludedRepoRoots(state?: vscode.Memento): Promise<string[]> {
  const openRepos = await discoverRepoRoots();
  if (!state) return openRepos;
  const excluded = new Set((state.get<string[]>(EXCLUDED_REPOS_KEY) ?? []).map((r) => path.resolve(r)));
  const extraIncluded = (state.get<string[]>(INCLUDED_REPOS_KEY) ?? []).map((r) => path.resolve(r));
  const openSet = new Set(openRepos.map((r) => path.resolve(r)));
  const result = openRepos.filter((r) => !excluded.has(path.resolve(r)));
  if (extraIncluded.length > 0) {
    const siblings = new Set((await discoverSiblingRepoRoots(openRepos)).map((r) => path.resolve(r)));
    for (const r of extraIncluded) {
      if (!openSet.has(r) && !excluded.has(r) && siblings.has(r)) {
        result.push(r);
      }
    }
  }
  return result;
}

/**
 * Prompts the user to select which repositories in the workspace (and any sibling repositories) to include or remove.
 * Opened workspace repositories are checked by default; sibling repositories are unchecked by default.
 */
export async function selectRepositoriesPrompt(context: vscode.ExtensionContext, onChanged: () => void): Promise<void> {
  const openRepos = await discoverRepoRoots();
  const siblingRepos = await discoverSiblingRepoRoots(openRepos);
  const allRepos = [...openRepos, ...siblingRepos];
  if (allRepos.length === 0) {
    void vscode.window.showInformationMessage('No Git repositories found in the current workspace.');
    return;
  }
  const openSet = new Set(openRepos.map((r) => path.resolve(r)));
  const excluded = new Set(
    (context.workspaceState.get<string[]>(EXCLUDED_REPOS_KEY) ?? []).map((r) => path.resolve(r)),
  );
  const included = new Set(
    (context.workspaceState.get<string[]>(INCLUDED_REPOS_KEY) ?? []).map((r) => path.resolve(r)),
  );
  const items = allRepos.map((root) => {
    const resolved = path.resolve(root);
    const isOpen = openSet.has(resolved);
    return {
      label: path.basename(root),
      description: isOpen ? root : `${root} (sibling)`,
      picked: isOpen ? !excluded.has(resolved) : included.has(resolved),
      root: resolved,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'ParaSpace: Select Repositories to Include',
    placeHolder: 'Check repositories to include in ParaSpace; uncheck to remove',
    canPickMany: true,
  });
  if (!picked) return;

  const pickedRoots = new Set(picked.map((p) => p.root));
  const newExcluded = openRepos.map((r) => path.resolve(r)).filter((r) => !pickedRoots.has(r));
  const newIncluded = siblingRepos.map((r) => path.resolve(r)).filter((r) => pickedRoots.has(r));
  await context.workspaceState.update(EXCLUDED_REPOS_KEY, newExcluded);
  await context.workspaceState.update(INCLUDED_REPOS_KEY, newIncluded);
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
