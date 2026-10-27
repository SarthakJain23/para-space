import { spawn } from 'node:child_process';
import path from 'node:path';
import * as p from '@clack/prompts';
import {
  type CreateResult,
  type WorkspaceRecord,
  filterWorkspaces,
  findMatchingWorkspace,
  findWorkspaceConfigFile,
  provisionWorkspaceBatch,
  writeAndSaveWorkspace,
} from '@para-space/core';
import pc from 'picocolors';
import { clackPrompter } from '../prompter.js';
import { log, ok, printJson } from '../runtime.js';
import type { BranchPlan } from './workspacePrompts.js';

/** Confirms and provisions worktrees sequentially, rolling back earlier worktrees if any fail. */
export async function provisionCliWorktrees(
  plans: BranchPlan[],
  requirement: string | undefined,
  ide: 'yes' | 'no',
  isInteractive: boolean,
): Promise<CreateResult[]> {
  const prompter = isInteractive ? clackPrompter : undefined;
  const spinner = isInteractive ? p.spinner() : undefined;
  if (spinner) spinner.start(`Creating worktrees across ${plans.length} repositories…`);

  try {
    const results = await provisionWorkspaceBatch({
      plans: plans.map((pl) => ({
        root: pl.repo.root,
        name: pl.repo.name,
        branch: pl.branch,
        base: pl.base,
      })),
      requirement,
      prompter,
      ide,
      log,
    });
    if (spinner) spinner.stop(pc.green('Worktrees created.'));
    return results;
  } catch (err) {
    if (spinner) spinner.stop(pc.red('Failed'));
    throw err;
  }
}

/** Writes the .code-workspace file and persists the workspace record in state. */
export async function writeMultiRepoWorkspace(
  results: CreateResult[],
  branchLabel: string,
  baseDir = process.cwd(),
  nameFlag?: string,
): Promise<string> {
  const existingWsFile = await findWorkspaceConfigFile(baseDir);
  const { workspaceFile } = await writeAndSaveWorkspace({
    results,
    branch: branchLabel,
    existingWorkspaceFile: existingWsFile,
    workspaceName: nameFlag,
  });
  return workspaceFile;
}

/** Generates the .code-workspace file, saves the workspace record to state, and prints output. */
export async function saveAndEmitWorkspace(
  results: CreateResult[],
  plans: BranchPlan[],
  nameFlag?: string,
  jsonFlag?: boolean,
): Promise<void> {
  const branchLabel = Array.from(new Set(plans.map((pl) => pl.branch))).join('-');
  const workspaceFilePath = await writeMultiRepoWorkspace(results, branchLabel, process.cwd(), nameFlag);

  if (jsonFlag) {
    printJson({ workspaceFile: workspaceFilePath, worktrees: results });
  } else {
    ok(`Workspace ready: ${pc.bold(workspaceFilePath)}`);
    for (const res of results) {
      const port = res.port !== undefined ? ` :${res.port}` : '';
      console.log(
        `  ${pc.cyan(path.basename(res.mainRoot))} → ${res.branch}${res.createdBranch ? pc.dim(' (new)') : ''}${port} (${pc.dim(res.path)})`,
      );
    }
    console.log(pc.dim(`\n  code ${workspaceFilePath}`));
  }
}

/** Spawns VS Code to open a workspace file or directory without blocking. */
export function openWithCode(targetPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('code', [targetPath], { detached: true, stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

/** Finds a recorded workspace matching by branch, name, or workspace file path. */
export const matchWorkspaceRecord: (records: WorkspaceRecord[], target: string) => WorkspaceRecord | undefined =
  findMatchingWorkspace;

/** Filters workspace records by case-insensitive substring across name, branch, file, and member repos. */
export const filterWorkspaceRecords: (records: WorkspaceRecord[], query?: string) => WorkspaceRecord[] =
  filterWorkspaces;
