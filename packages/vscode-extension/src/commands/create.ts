import fs from 'node:fs';
import path from 'node:path';
import {
  type CreateResult,
  type Logger,
  branchExists,
  colorForHex,
  createWorktree,
  listBranches,
  removeWorktree,
  saveWorkspaceRecord,
} from '@para-space/core';
import * as vscode from 'vscode';
import {
  type CodeWorkspaceConfig,
  buildMultiRepoWorkspaceConfig,
  multiRepoWorkspaceFilePath,
  sharedBranches,
} from '../dialogs.js';
import { vscodePrompter } from '../prompter.js';
import { action, ask, pick, pickBranch, pickMany, withProgress, CancelledError } from '../runtime.js';
import type { WorktreeStore } from '../store.js';
import { discoverRepoRoots, requireActiveRepoRoot } from '../workspace.js';
import { type CommandContext, openInNewWindow } from './context.js';

const TITLE = 'ParaSpace: Create Worktree';

export interface TargetRepo {
  root: string;
  name: string;
}

interface BranchPlan {
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

interface ProvisionParams {
  plans: BranchPlan[];
  requirement?: string;
  ide: 'ask' | 'yes' | 'no';
  log: Logger;
}

/** Determines which repositories in the workspace to provision worktrees for. */
async function resolveTargetRepos(target: unknown, store: WorktreeStore): Promise<TargetRepo[]> {
  let targetRepoRoot: string | undefined;
  if (target && typeof target === 'object') {
    const t = target as CreateCommandArgs;
    if (Array.isArray(t.repos) && t.repos.length > 0) {
      return t.repos.map((r) => ({ root: r, name: path.basename(r) }));
    }
    targetRepoRoot = t.repo?.root ?? t.repoRoot;
  }

  if (targetRepoRoot) {
    const found = store.repos.find((r) => r.root === targetRepoRoot);
    return [found ?? { root: targetRepoRoot, name: path.basename(targetRepoRoot) }];
  }

  const roots = await discoverRepoRoots();
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
async function resolveBranchPlans(targetRepos: TargetRepo[], target?: unknown): Promise<BranchPlan[]> {
  const t = target && typeof target === 'object' ? (target as CreateCommandArgs) : undefined;
  if (t?.branch) {
    return targetRepos.map((repo) => ({ repo, branch: t.branch!, base: t.base }));
  }
  return promptBranchPlans(targetRepos);
}

/** Resolves worktree requirement either from command arguments or interactive prompts. */
async function resolveRequirement(target?: unknown): Promise<string | undefined> {
  const t = target && typeof target === 'object' ? (target as CreateCommandArgs) : undefined;
  if (t?.requirement !== undefined) {
    return t.requirement;
  }
  return promptRequirement();
}

/** Prompts for the base branch in one repository when creating a new branch. */
async function promptBaseBranch(repo: TargetRepo, branches: string[]): Promise<string | undefined> {
  if (branches.length === 0) return undefined;
  return (
    await pick(
      branches.map((branch) => ({ label: branch })),
      { title: TITLE, placeHolder: `Base branch for ${repo.name}` },
    )
  ).label;
}

/** Prompts for a branch and optional base independently in each repository. */
async function promptPerRepoBranchPlans(targetRepos: TargetRepo[], branchLists: string[][]): Promise<BranchPlan[]> {
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
async function promptBranchPlans(targetRepos: TargetRepo[]): Promise<BranchPlan[]> {
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
async function promptRequirement(): Promise<string | undefined> {
  const answer = await ask({
    title: TITLE,
    prompt: 'Why does this worktree exist? Optional, recorded in the context ledger',
    placeHolder: 'Auth redesign',
  });
  return answer.trim() || undefined;
}

/** Provisions worktrees sequentially, rolling back earlier worktrees if a later repo fails. */
async function provisionWorktrees({ plans, requirement, ide, log }: ProvisionParams): Promise<CreateResult[]> {
  const created: CreateResult[] = [];
  for (const { repo, branch, base } of plans) {
    try {
      const repoHasBranch = await branchExists(repo.root, branch);
      const repoBase = !repoHasBranch && base && (await branchExists(repo.root, base)) ? base : undefined;
      const res = await createWorktree({
        cwd: repo.root,
        branch,
        base: repoBase,
        requirement,
        prompter: vscodePrompter,
        ide,
        log,
      });
      created.push(res);
    } catch (err) {
      const rollbackFailures: string[] = [];
      for (const prev of created) {
        try {
          await removeWorktree({
            cwd: prev.mainRoot,
            target: prev.path,
            force: true,
            deleteBranch: prev.createdBranch,
            log,
          });
        } catch (rollbackError) {
          const message = (rollbackError as Error).message;
          rollbackFailures.push(`${prev.path}: ${message}`);
          log.warn(`Could not roll back worktree ${prev.path}: ${message}`);
        }
      }
      if (rollbackFailures.length > 0) {
        throw new Error(
          `Worktree creation failed: ${(err as Error).message}. Rollback also failed: ${rollbackFailures.join('; ')}`,
        );
      }
      throw err;
    }
  }
  return created;
}

/** Notifies the user and opens the single worktree folder in a new window. */
async function openSingleWorktree(res: CreateResult): Promise<void> {
  const port = res.port !== undefined ? ` on port ${res.port}` : '';
  void vscode.window.showInformationMessage(`Worktree ready: ${path.basename(res.path)}${port}`);
  await openInNewWindow(res.path);
}

/** Generates or updates a .code-workspace file for multi-repo worktrees and opens it in a new window. */
async function openMultiRepoWorkspace(results: CreateResult[], branch: string): Promise<void> {
  let existingConfig: CodeWorkspaceConfig | undefined;
  let existingWorkspaceFilePath: string | undefined;
  if (vscode.workspace.workspaceFile && vscode.workspace.workspaceFile.scheme === 'file') {
    existingWorkspaceFilePath = vscode.workspace.workspaceFile.fsPath;
    try {
      const raw = await fs.promises.readFile(existingWorkspaceFilePath, 'utf8');
      existingConfig = JSON.parse(raw);
    } catch {
      // ignore read error
    }
  }

  const hex = results.find((r) => r.color)?.color;
  const colorProfile = colorForHex(hex);

  const workspaceConfig = buildMultiRepoWorkspaceConfig(
    results.map((r) => ({ mainRoot: r.mainRoot, worktreePath: r.path })),
    existingConfig,
    colorProfile,
  );

  const workspaceFilePath = multiRepoWorkspaceFilePath(
    results.map((r) => r.path),
    branch,
    existingWorkspaceFilePath,
    vscode.workspace.name,
  );

  await fs.promises.writeFile(workspaceFilePath, JSON.stringify(workspaceConfig, null, 2), 'utf8');

  await saveWorkspaceRecord({
    id: workspaceFilePath,
    name: path.basename(workspaceFilePath, '.code-workspace'),
    workspaceFile: workspaceFilePath,
    branch,
    color: hex,
    repos: results.map((r) => ({
      root: r.mainRoot,
      name: path.basename(r.mainRoot),
      worktreePath: r.path,
    })),
    createdAt: new Date().toISOString(),
  });

  const ports = results
    .map((r) => (r.port !== undefined ? `${path.basename(r.mainRoot)}: ${r.port}` : undefined))
    .filter(Boolean);
  const portInfo = ports.length > 0 ? ` on ports ${ports.join(', ')}` : '';
  const readyMessage =
    branch === 'multi-branch'
      ? `Workspace ready across ${results.length} repositories`
      : `Workspace ready for ${branch}`;
  void vscode.window.showInformationMessage(`${readyMessage}${portInfo}`);
  await openInNewWindow(workspaceFilePath);
}

/** Presents completion notifications and opens the resulting worktree or workspace. */
async function notifyAndOpen(results: CreateResult[], workspaceLabel: string): Promise<void> {
  if (results.length === 1) {
    await openSingleWorktree(results[0]);
  } else {
    await openMultiRepoWorkspace(results, workspaceLabel);
  }
}

/**
 * `paraSpace.createWorktree`: creates worktree(s) for a branch.
 * If targeted on a specific repository, creates a worktree for that repo.
 * In a multi-repo workspace, creates worktrees across all workspace repositories
 * and opens them together as a multi-root workspace.
 */
export function registerCreate({ rt, store }: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'paraSpace.createWorktree',
    action(rt, async (target?: unknown) => {
      const targetRepos = await resolveTargetRepos(target, store);
      const plans = await resolveBranchPlans(targetRepos, target);
      const requirement = await resolveRequirement(target);
      const ide =
        target && typeof target === 'object' && 'ide' in target ? ((target as CreateCommandArgs).ide ?? 'yes') : 'yes';
      const branchNames = Array.from(new Set(plans.map((plan) => plan.branch)));
      const workspaceLabel = branchNames.length === 1 ? branchNames[0] : 'multi-branch';

      const results = await withProgress(
        plans.length > 1
          ? `Creating worktrees across ${plans.length} repositories…`
          : `Creating worktree ${plans[0].branch}…`,
        () => provisionWorktrees({ plans, requirement, ide, log: rt.log }),
      );

      void store.load();
      await notifyAndOpen(results, workspaceLabel);
    }),
  );
}
