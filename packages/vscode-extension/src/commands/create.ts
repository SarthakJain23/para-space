import path from 'node:path';
import { type CreateResult, type Logger, provisionWorkspaceBatch, writeAndSaveWorkspace } from '@para-space/core';
import * as vscode from 'vscode';
import { vscodePrompter } from '../prompter.js';
import { action, withProgress } from '../runtime.js';
import { type CommandContext, openInNewWindow } from './context.js';
import {
  type BranchPlan,
  type CreateCommandArgs,
  type TargetRepo,
  resolveBranchPlans,
  resolveRequirement,
  resolveTargetRepos,
} from './createPrompts.js';

export type { BranchPlan, CreateCommandArgs, TargetRepo };

interface ProvisionParams {
  plans: BranchPlan[];
  requirement?: string;
  ide: 'ask' | 'yes' | 'no';
  log: Logger;
}

/** Provisions worktrees sequentially, rolling back earlier worktrees if a later repo fails. */
export async function provisionWorktrees({ plans, requirement, ide, log }: ProvisionParams): Promise<CreateResult[]> {
  return provisionWorkspaceBatch({
    plans: plans.map(({ repo, branch, base }) => ({ root: repo.root, name: repo.name, branch, base })),
    requirement,
    prompter: vscodePrompter,
    ide,
    log,
  });
}

/** Notifies the user and opens the single worktree folder in a new window. */
export async function openSingleWorktree(res: CreateResult): Promise<void> {
  const port = res.port !== undefined ? ` on port ${res.port}` : '';
  void vscode.window.showInformationMessage(`Worktree ready: ${path.basename(res.path)}${port}`);
  await openInNewWindow(res.path);
}

/** Generates or updates a .code-workspace file for multi-repo worktrees and opens it in a new window. */
export async function openMultiRepoWorkspace(results: CreateResult[], branch: string): Promise<void> {
  const existingWorkspaceFile =
    vscode.workspace.workspaceFile && vscode.workspace.workspaceFile.scheme === 'file'
      ? vscode.workspace.workspaceFile.fsPath
      : undefined;

  const { workspaceFile } = await writeAndSaveWorkspace({
    results,
    branch,
    existingWorkspaceFile,
    workspaceName: vscode.workspace.name,
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
  await openInNewWindow(workspaceFile);
}

/** Presents completion notifications and opens the resulting worktree or workspace. */
export async function notifyAndOpen(results: CreateResult[], workspaceLabel: string): Promise<void> {
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
