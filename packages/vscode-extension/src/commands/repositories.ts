import path from 'node:path';
import {
  type WorkspaceRecord,
  addReposToWorkspace,
  discoverCandidateReposForWorkspace,
  findMatchingWorkspace,
  getWorkspaceRecords,
  mainRepoRoot,
  resolveRepoInput,
} from '@para-space/core';
import * as vscode from 'vscode';
import { vscodePrompter } from '../prompter.js';
import { CancelledError, action, pick, pickMany, withProgress } from '../runtime.js';
import type { WorktreeStore } from '../store.js';
import { WorkspaceNode } from '../tree.js';
import { findWorkspaceRoot, selectRepositoriesPrompt } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';
import { type TargetRepo, resolveBranchPlans, resolveRequirement } from './createPrompts.js';

const ADD_REPO_TITLE = 'ParaSpace: Add Repository to Workspace';
const BROWSE_REPO_ROOT = '__browse__';

export interface AddRepoToWorkspaceArgs {
  target?: string;
  workspace?: WorkspaceRecord;
  repos?: string[];
  branch?: string;
  base?: string;
  requirement?: string;
  ide?: 'ask' | 'yes' | 'no';
}

async function resolveTargetWorkspaceForAdd(target: unknown, store: WorktreeStore): Promise<WorkspaceRecord> {
  if (target instanceof WorkspaceNode) {
    return target.workspace;
  }
  if (
    target &&
    typeof target === 'object' &&
    'workspace' in target &&
    (target as { workspace?: WorkspaceRecord }).workspace
  ) {
    return (target as { workspace: WorkspaceRecord }).workspace;
  }

  await store.load();
  const allWorkspaces = store.workspaces.length > 0 ? store.workspaces : await getWorkspaceRecords();

  if (
    target &&
    typeof target === 'object' &&
    'target' in target &&
    typeof (target as AddRepoToWorkspaceArgs).target === 'string'
  ) {
    const query = (target as AddRepoToWorkspaceArgs).target!;
    const matched =
      findMatchingWorkspace(allWorkspaces, query) ?? findMatchingWorkspace(await getWorkspaceRecords(), query);
    if (!matched) {
      throw new Error(`No multi-repository workspace found matching "${query}".`);
    }
    return matched;
  }

  if (store.currentWorkspace) {
    return store.currentWorkspace;
  }
  if (allWorkspaces.length === 0) {
    throw new Error('No multi-repository workspaces found. Create a multi-repository workspace first.');
  }
  if (allWorkspaces.length === 1) {
    return allWorkspaces[0];
  }

  const chosen = await pick(
    allWorkspaces.map((ws) => ({
      label: ws.branch || ws.name,
      description: `${ws.repos.length} repos (${ws.repos.map((r) => r.name).join(', ')})`,
      detail: ws.workspaceFile,
      workspace: ws,
    })),
    {
      title: ADD_REPO_TITLE,
      placeHolder: 'Select the multi-repository workspace to add repositories to',
    },
  );
  return chosen.workspace;
}

async function browseForRepoRoots(): Promise<string[]> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Add Repository',
    title: ADD_REPO_TITLE,
  });
  if (!uris || uris.length === 0) {
    throw new CancelledError();
  }
  const roots: string[] = [];
  for (const uri of uris) {
    const root = await mainRepoRoot(uri.fsPath);
    roots.push(path.resolve(root));
  }
  return Array.from(new Set(roots));
}

async function resolveReposToAdd(
  workspace: WorkspaceRecord,
  target: unknown,
  store: WorktreeStore,
): Promise<TargetRepo[]> {
  const baseDir = findWorkspaceRoot() ?? workspace.repos[0]?.root ?? process.cwd();
  if (
    target &&
    typeof target === 'object' &&
    'repos' in target &&
    Array.isArray((target as AddRepoToWorkspaceArgs).repos)
  ) {
    const repoInputs = (target as AddRepoToWorkspaceArgs).repos!;
    if (repoInputs.length > 0) {
      const resolved = await Promise.all(repoInputs.map((r) => resolveRepoInput(r, baseDir, workspace)));
      const unique = Array.from(new Set(resolved));
      return unique.map((root) => ({ root, name: path.basename(root) }));
    }
  }

  const existingRoots = new Set(workspace.repos.map((r) => path.resolve(r.root)));
  const candidates = await discoverCandidateReposForWorkspace(workspace, baseDir);
  for (const repo of store.repos) {
    const resolved = path.resolve(repo.root);
    if (!existingRoots.has(resolved) && !candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  }

  if (candidates.length === 0) {
    const browsed = await browseForRepoRoots();
    return browsed.map((root) => ({ root, name: path.basename(root) }));
  }

  const items = [
    ...candidates.map((root) => ({
      label: path.basename(root),
      description: root,
      root,
      picked: false,
    })),
    {
      label: '$(folder-opened) Browse for repository folder…',
      description: 'Select a Git repository folder from disk',
      root: BROWSE_REPO_ROOT,
      picked: false,
    },
  ];

  const selected = await pickMany(items, {
    title: ADD_REPO_TITLE,
    placeHolder: `Select repositories to add to "${workspace.branch || workspace.name}"`,
  });

  const chosenRoots = new Set<string>();
  for (const item of selected) {
    if (item.root === BROWSE_REPO_ROOT) {
      const browsed = await browseForRepoRoots();
      for (const r of browsed) chosenRoots.add(r);
    } else {
      chosenRoots.add(item.root);
    }
  }

  if (chosenRoots.size === 0) {
    void vscode.window.showInformationMessage('Select at least one repository to add to the workspace.');
    throw new CancelledError();
  }

  return Array.from(chosenRoots).map((root) => ({ root, name: path.basename(root) }));
}

/**
 * `paraSpace.selectRepositories`: allows the user to check which repositories in the workspace
 * are managed by ParaSpace, and uncheck any they wish to remove/exclude.
 */
export function registerSelectRepositories({ rt, store, extensionContext }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.selectRepositories',
    action(rt, async () => {
      await selectRepositoriesPrompt(extensionContext, () => void store.load());
    }),
  );
}

/**
 * `paraSpace.addRepoToWorkspace`: adds one or more repositories to an existing multi-repo workspace,
 * provisioning or reusing their worktrees and updating the `.code-workspace` file.
 */
export function registerAddRepoToWorkspace({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.addRepoToWorkspace',
    action(rt, async (target?: unknown) => {
      const workspace = await resolveTargetWorkspaceForAdd(target, store);
      const targetRepos = await resolveReposToAdd(workspace, target, store);

      const args = target && typeof target === 'object' ? (target as AddRepoToWorkspaceArgs) : undefined;
      const isProgrammatic = Boolean(args?.repos && args.repos.length > 0);
      const branchArg = args?.branch ?? (isProgrammatic ? workspace.branch : undefined);

      const plans = branchArg
        ? targetRepos.map((repo) => ({ repo, branch: branchArg, base: args?.base }))
        : await resolveBranchPlans(targetRepos, { branch: workspace.branch });
      const requirement = isProgrammatic ? args?.requirement : await resolveRequirement(target);
      const ide = args?.ide ?? 'yes';

      const res = await withProgress(
        `Adding ${plans.map((p) => p.repo.name).join(', ')} to workspace ${workspace.branch || workspace.name}…`,
        () =>
          addReposToWorkspace({
            workspace,
            plans: plans.map(({ repo, branch, base }) => ({
              root: repo.root,
              name: repo.name,
              branch,
              base,
            })),
            requirement,
            prompter: vscodePrompter,
            ide,
            log: rt.log,
          }),
      );

      await store.load();

      const addedNames = res.added.map((r) => path.basename(r.mainRoot)).join(', ');
      const message =
        res.added.length > 0
          ? `Added ${addedNames} to workspace ${workspace.branch || workspace.name}.`
          : `Repositories (${res.skipped.join(', ')}) are already part of workspace ${workspace.branch || workspace.name}.`;

      const currentWsFile = vscode.workspace.workspaceFile?.fsPath;
      const isCurrentWindow =
        Boolean(currentWsFile) && path.resolve(currentWsFile!) === path.resolve(res.workspaceFile);

      if (isCurrentWindow) {
        void vscode.window.showInformationMessage(message);
      } else {
        void vscode.window.showInformationMessage(message);
        await openInNewWindow(res.workspaceFile);
      }
    }),
  );
}
