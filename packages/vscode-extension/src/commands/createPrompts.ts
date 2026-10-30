import path from 'node:path';
import { listBranches, resolveRepoInput } from '@para-space/core';
import * as vscode from 'vscode';
import { sharedBranches } from '../dialogs.js';
import { CancelledError, ask, pick, pickBranch, pickMany } from '../runtime.js';
import type { WorktreeStore } from '../store.js';
import { discoverRepoRoots, findWorkspaceRoot, requireActiveRepoRoot } from '../workspace.js';

const TITLE = 'ParaSpace: Create Worktree';

export interface TargetRepo {
  root: string;
  name: string;
}

export interface BranchPlan {
  repo: TargetRepo;
  branch: string;
  base?: string;
}

export interface CreateCommandArgs {
  branch?: string;
  base?: string;
  requirement?: string;
  repo?: { root: string };
  repoRoot?: string;
  repos?: string[];
  ide?: 'ask' | 'yes' | 'no';
}

/** Determines which repositories in the workspace to provision worktrees for. */
export async function resolveTargetRepos(target: unknown, store: WorktreeStore): Promise<TargetRepo[]> {
  const isTreeItem =
    target instanceof vscode.TreeItem || Boolean(target && typeof target === 'object' && 'contextValue' in target);
  let targetRepoRoot: string | undefined;
  if (!isTreeItem && target && typeof target === 'object') {
    const t = target as CreateCommandArgs;
    if (Array.isArray(t.repos) && t.repos.length > 0) {
      const baseDir = findWorkspaceRoot() ?? store.root ?? process.cwd();
      const resolved = await Promise.all(
        t.repos.map((r) => resolveRepoInput(r, baseDir, store.currentWorkspace).catch(() => path.resolve(baseDir, r))),
      );
      const unique = Array.from(new Set(resolved));
      return unique.map((root) => ({ root, name: path.basename(root) }));
    }
    targetRepoRoot = t.repo?.root ?? t.repoRoot;
  }

  if (targetRepoRoot) {
    const found = store.repos.find((r) => r.root === targetRepoRoot);
    return [found ?? { root: targetRepoRoot, name: path.basename(targetRepoRoot) }];
  }

  const discovered = await discoverRepoRoots();
  const roots = Array.from(
    new Set([
      ...discovered,
      ...store.repos.map((r) => r.root),
      ...store.workspaces.flatMap((w) => w.repos.map((r) => r.root)),
    ]),
  );
  if (roots.length <= 1) {
    const root = roots[0] ?? requireActiveRepoRoot(store.roots);
    return [{ root, name: path.basename(root) }];
  }

  const items = roots.map((root) => ({
    label: path.basename(root),
    description: root,
    root,
    picked: store.roots.includes(root),
  }));
  const selected = await pickMany(items, {
    title: TITLE,
    placeHolder: 'Select repositories for this ParaSpace workspace',
  });
  const repos = selected.map(({ root }) => ({ root, name: path.basename(root) }));
  if (repos.length === 0) {
    void vscode.window.showInformationMessage('Select at least one repository to create a ParaSpace workspace.');
    throw new CancelledError();
  }
  return repos;
}

/** Resolves branch plan either from command arguments or interactive prompts. */
export async function resolveBranchPlans(targetRepos: TargetRepo[], target?: unknown): Promise<BranchPlan[]> {
  const t = target && typeof target === 'object' ? (target as CreateCommandArgs) : undefined;
  if (t?.branch) {
    return targetRepos.map((repo) => ({ repo, branch: t.branch!, base: t.base }));
  }
  return promptBranchPlans(targetRepos);
}

/** Resolves worktree requirement either from command arguments or interactive prompts. */
export async function resolveRequirement(target?: unknown): Promise<string | undefined> {
  const t = target && typeof target === 'object' ? (target as CreateCommandArgs) : undefined;
  if (t?.requirement !== undefined) {
    return t.requirement;
  }
  return promptRequirement();
}

/** Prompts for the base branch in one repository when creating a new branch. */
export async function promptBaseBranch(repo: TargetRepo, branches: string[]): Promise<string | undefined> {
  if (branches.length === 0) return undefined;
  return (
    await pick(
      branches.map((branch) => ({ label: branch })),
      { title: TITLE, placeHolder: `Base branch for ${repo.name}` },
    )
  ).label;
}

/** Prompts for a branch and optional base independently in each repository. */
export async function promptPerRepoBranchPlans(
  targetRepos: TargetRepo[],
  branchLists: string[][],
): Promise<BranchPlan[]> {
  const plans: BranchPlan[] = [];
  for (let i = 0; i < targetRepos.length; i += 1) {
    const repo = targetRepos[i];
    const { branch, isNew } = await pickBranch(branchLists[i], {
      title: TITLE,
      placeHolder: `Select or create branch for ${repo.name}`,
    });
    const base = isNew ? await promptBaseBranch(repo, branchLists[i]) : undefined;
    plans.push({ repo, branch, base });
  }
  return plans;
}

/** Picks one shared branch for every repo or lets the user configure branches repo by repo. */
export async function promptBranchPlans(targetRepos: TargetRepo[]): Promise<BranchPlan[]> {
  const branchLists = await Promise.all(targetRepos.map((repo) => listBranches({ cwd: repo.root })));
  if (targetRepos.length === 1) {
    const repo = targetRepos[0];
    const { branch, isNew } = await pickBranch(branchLists[0], {
      title: TITLE,
      placeHolder: `Select or create branch for ${repo.name}`,
    });
    const base = isNew ? await promptBaseBranch(repo, branchLists[0]) : undefined;
    return [{ repo, branch, base }];
  }

  const choice = await pick(
    [
      {
        label: 'Use a shared branch',
        description: 'Choose an existing branch available in every selected repository, or create one across them',
        value: 'shared' as const,
      },
      {
        label: 'Choose branches per repository (Advanced)',
        description: 'Select a different existing or new branch for each repository',
        value: 'per-repo' as const,
      },
    ],
    { title: TITLE, placeHolder: 'How should branches be selected?' },
  );

  if (choice.value === 'per-repo') {
    return promptPerRepoBranchPlans(targetRepos, branchLists);
  }

  const availableBranches = sharedBranches(branchLists);
  const { branch, isNew } = await pickBranch(availableBranches, {
    title: TITLE,
    placeHolder: 'Select a shared branch or type a new branch name',
  });

  if (!isNew) return targetRepos.map((repo) => ({ repo, branch }));
  if (branchLists.some((branches) => branches.includes(branch))) {
    const advanced = 'Choose branches per repository (Advanced)';
    const answer = await vscode.window.showWarningMessage(
      `Branch "${branch}" exists in only some selected repositories.`,
      { modal: true, detail: 'Use Advanced to choose the existing or new branch separately for each repository.' },
      advanced,
    );
    if (answer === advanced) return promptPerRepoBranchPlans(targetRepos, branchLists);
    throw new CancelledError();
  }

  const plans: BranchPlan[] = [];
  for (let i = 0; i < targetRepos.length; i += 1) {
    const repo = targetRepos[i];
    const base = await promptBaseBranch(repo, branchLists[i]);
    plans.push({ repo, branch, base });
  }
  return plans;
}

/** Prompts for an optional reason for the worktree, recorded in the context ledger. */
export async function promptRequirement(): Promise<string | undefined> {
  const answer = await ask({
    title: TITLE,
    prompt: 'Why does this worktree exist? Optional, recorded in the context ledger',
    placeHolder: 'Auth redesign',
  });
  return answer.trim() || undefined;
}
