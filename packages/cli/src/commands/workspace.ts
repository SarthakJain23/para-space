import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import {
  type CreateResult,
  branchExists,
  buildMultiRepoWorkspaceConfig,
  colorForHex,
  createWorktree,
  discoverWorkspaceRepoRoots,
  exists,
  findWorkspaceConfigFile,
  listBranches,
  mainRepoRoot,
  multiRepoWorkspaceFilePath,
  readWorkspaceConfigFile,
  removeWorktree,
  saveWorkspaceRecord,
  getWorkspaceRecords,
  sharedBranches,
  validateBranchName,
} from '@para-space/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import { bail, clackPrompter } from '../prompter.js';
import { action, log, ok, printJson } from '../runtime.js';

interface Flags {
  repo?: string[];
  base?: string;
  perRepo?: boolean;
  requirement?: string;
  name?: string;
  ide?: boolean;
  yes?: boolean;
  json?: boolean;
}

interface TargetRepo {
  root: string;
  name: string;
}

interface BranchPlan {
  repo: TargetRepo;
  branch: string;
  base?: string;
}

async function selectOption<T extends string>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
): Promise<T> {
  const result = await p.select<any, T>({
    message,
    options,
  });
  return bail(result as T | symbol);
}

async function promptPerRepo(
  targetRepos: TargetRepo[],
  branchLists: string[][],
  suggestedBranch?: string,
): Promise<BranchPlan[]> {
  const plans: BranchPlan[] = [];
  for (let i = 0; i < targetRepos.length; i++) {
    const repo = targetRepos[i];
    const branches = branchLists[i];
    const branchExistsInRepo = Boolean(suggestedBranch && branches.includes(suggestedBranch));
    const options = [
      { value: '__create__', label: '+ Create new branch…', hint: 'Enter branch name' },
      ...branches.map((b) => ({ value: b, label: b })),
    ];
    let selectedBranch: string;
    if (suggestedBranch) {
      const useSuggested = bail(
        await p.confirm({
          message: `${repo.name}: use branch "${suggestedBranch}"? (${branchExistsInRepo ? 'exists' : 'will create'})`,
          initialValue: true,
        }),
      );
      selectedBranch = useSuggested
        ? branchExistsInRepo
          ? suggestedBranch
          : '__create_suggested__'
        : await selectOption(`Select branch for ${repo.name}:`, options);
    } else {
      selectedBranch = await selectOption(`Select branch for ${repo.name}:`, options);
    }

    if (selectedBranch === '__create__' || selectedBranch === '__create_suggested__') {
      const bName =
        selectedBranch === '__create_suggested__'
          ? suggestedBranch!
          : bail(await p.text({ message: `Branch name for ${repo.name}:`, validate: validateBranchName })).trim();
      const base =
        branches.length > 0
          ? await selectOption(
              `Base branch for ${repo.name}:`,
              branches.map((b) => ({ value: b, label: b })),
            )
          : undefined;
      plans.push({ repo, branch: bName, base });
    } else {
      plans.push({ repo, branch: selectedBranch });
    }
  }
  return plans;
}

/** Resolves the target repositories for workspace creation from flags or discovery. */
async function resolveCliTargetRepos(flags: Flags, isInteractive: boolean): Promise<TargetRepo[]> {
  let selectedRoots: string[] = [];
  if (flags.repo && flags.repo.length > 0) {
    const resolved = await Promise.all(flags.repo.map((r) => mainRepoRoot(path.resolve(r))));
    selectedRoots = Array.from(new Set(resolved));
  } else {
    const discovered = await discoverWorkspaceRepoRoots(process.cwd());
    if (discovered.length === 0) {
      throw new Error('No Git repositories found. Pass --repo <path...> to specify repositories.');
    }
    if (discovered.length === 1 || !isInteractive) {
      selectedRoots = discovered;
    } else {
      selectedRoots = bail(
        await p.multiselect({
          message: 'Select repositories for this workspace:',
          options: discovered.map((r) => ({ value: r, label: path.basename(r), hint: r })),
          initialValues: discovered,
          required: true,
        }),
      );
    }
  }
  return selectedRoots.map((root) => ({ root, name: path.basename(root) }));
}

/** Resolves branch plans for all target repositories either from flags, shared selection, or per-repo prompts. */
async function planCliBranches(
  targetRepos: TargetRepo[],
  branchLists: string[][],
  branchArg: string | undefined,
  flags: Flags,
  isInteractive: boolean,
): Promise<BranchPlan[]> {
  if (branchArg) {
    const existsIn = await Promise.all(targetRepos.map((r) => branchExists(r.root, branchArg)));
    if (existsIn.every(Boolean)) {
      return targetRepos.map((r) => ({ repo: r, branch: branchArg }));
    }
    if (existsIn.every((e) => !e)) {
      const bases: (string | undefined)[] = [];
      for (let i = 0; i < targetRepos.length; i++) {
        const repo = targetRepos[i];
        if (flags.base) {
          const hasBase = await branchExists(repo.root, flags.base);
          bases.push(hasBase ? flags.base : undefined);
        } else if (isInteractive && branchLists[i].length > 0) {
          bases.push(
            await selectOption(
              `Base branch for ${repo.name}:`,
              branchLists[i].map((b) => ({ value: b, label: b })),
            ),
          );
        } else {
          bases.push(undefined);
        }
      }
      return targetRepos.map((r, i) => ({ repo: r, branch: branchArg, base: bases[i] }));
    }

    if (isInteractive) {
      p.note(`Branch "${branchArg}" exists in only some repositories.`);
      const proceed = bail(
        await p.confirm({
          message: 'Configure branches per repository (Advanced)?',
          initialValue: true,
        }),
      );
      if (!proceed) throw new Error('Cancelled.');
      return promptPerRepo(targetRepos, branchLists, branchArg);
    }
    throw new Error(
      `Branch "${branchArg}" exists in only some repositories. Pass --per-repo or ensure branch state matches.`,
    );
  }

  if (!isInteractive) {
    throw new Error('Branch name is required in non-interactive mode. Usage: para workspace create <branch>');
  }

  if (flags.perRepo) {
    return promptPerRepo(targetRepos, branchLists);
  }

  const mode = await selectOption('How should branches be selected?', [
    {
      value: 'shared',
      label: 'Use a shared branch',
      hint: 'Available across all selected repos or created across them',
    },
    {
      value: 'per-repo',
      label: 'Choose branches per repository (Advanced)',
      hint: 'Select a different branch for each repository',
    },
  ]);

  if (mode === 'per-repo') {
    return promptPerRepo(targetRepos, branchLists);
  }

  const common = sharedBranches(branchLists);
  const branchOptions = [
    {
      value: '__create__',
      label: '+ Create new branch…',
      hint: 'Enter branch name to create in all repos',
    },
    ...common.map((b) => ({ value: b, label: b })),
  ];
  const selectedBranch = await selectOption('Select a shared branch or create a new branch:', branchOptions);

  if (selectedBranch === '__create__') {
    const newBranch = bail(
      await p.text({
        message: 'Branch name (new):',
        validate: validateBranchName,
      }),
    ).trim();

    const someExist = branchLists.some((b) => b.includes(newBranch));
    if (someExist) {
      p.note(`Branch "${newBranch}" already exists in some repositories.`);
      return promptPerRepo(targetRepos, branchLists, newBranch);
    }

    const bases: (string | undefined)[] = [];
    for (let i = 0; i < targetRepos.length; i++) {
      const repo = targetRepos[i];
      bases.push(
        branchLists[i].length > 0
          ? await selectOption(
              `Base branch for ${repo.name}:`,
              branchLists[i].map((b) => ({ value: b, label: b })),
            )
          : undefined,
      );
    }
    return targetRepos.map((r, i) => ({ repo: r, branch: newBranch, base: bases[i] }));
  }

  return targetRepos.map((r) => ({ repo: r, branch: selectedBranch }));
}

/** Confirms and provisions worktrees sequentially, rolling back earlier worktrees if any fail. */
async function provisionCliWorktrees(
  plans: BranchPlan[],
  requirement: string | undefined,
  ide: 'yes' | 'no',
  isInteractive: boolean,
): Promise<CreateResult[]> {
  const prompter = isInteractive ? clackPrompter : undefined;
  const results: CreateResult[] = [];
  const spinner = isInteractive ? p.spinner() : undefined;
  if (spinner) spinner.start(`Creating worktrees across ${plans.length} repositories…`);

  for (const plan of plans) {
    try {
      const hasBranch = await branchExists(plan.repo.root, plan.branch);
      const repoBase =
        !hasBranch && plan.base && (await branchExists(plan.repo.root, plan.base)) ? plan.base : undefined;
      const res = await createWorktree({
        cwd: plan.repo.root,
        branch: plan.branch,
        base: repoBase,
        requirement,
        prompter,
        ide,
        log,
      });
      results.push(res);
    } catch (err) {
      if (spinner) spinner.stop(pc.red('Failed'));
      for (const prev of results) {
        try {
          await removeWorktree({
            cwd: prev.mainRoot,
            target: prev.path,
            force: true,
            deleteBranch: prev.createdBranch,
            log,
          });
        } catch (rollbackErr) {
          log.warn(`Rollback failed for ${prev.path}: ${(rollbackErr as Error).message}`);
        }
      }
      throw err;
    }
  }

  if (spinner) spinner.stop(pc.green('Worktrees created.'));
  return results;
}

/** Generates the .code-workspace file, saves the workspace record to state, and prints output. */
async function saveAndEmitWorkspace(
  results: CreateResult[],
  plans: BranchPlan[],
  nameFlag?: string,
  jsonFlag?: boolean,
): Promise<void> {
  const existingWsFile = await findWorkspaceConfigFile(process.cwd());
  const existingConfig = existingWsFile ? await readWorkspaceConfigFile(existingWsFile) : undefined;
  const hex = results.find((r) => r.color)?.color;
  const colorProfile = colorForHex(hex);
  const wsConfig = buildMultiRepoWorkspaceConfig(
    results.map((r) => ({ mainRoot: r.mainRoot, worktreePath: r.path })),
    existingConfig,
    colorProfile,
  );
  const branchLabel = Array.from(new Set(plans.map((pl) => pl.branch))).join('-');
  const workspaceFilePath = multiRepoWorkspaceFilePath(
    results.map((r) => r.path),
    branchLabel,
    existingWsFile,
    nameFlag,
  );

  await fs.writeFile(workspaceFilePath, JSON.stringify(wsConfig, null, 2), 'utf8');

  await saveWorkspaceRecord({
    id: workspaceFilePath,
    name: path.basename(workspaceFilePath, '.code-workspace'),
    workspaceFile: workspaceFilePath,
    branch: branchLabel,
    color: hex,
    repos: results.map((r) => ({
      root: r.mainRoot,
      name: path.basename(r.mainRoot),
      worktreePath: r.path,
    })),
    createdAt: new Date().toISOString(),
  });

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
function openWithCode(targetPath: string): Promise<boolean> {
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

export function registerWorkspace(program: Command) {
  const ws = program.command('workspace').alias('ws').description('Manage multi-repository parallel workspaces');

  ws.command('create [branch]', { isDefault: true })
    .description('Create parallel worktrees across multiple repositories for a branch')
    .option('--repo <paths...>', 'repositories to include (default: discover in workspace/cwd)')
    .option('-b, --base <ref>', 'base ref for new branches')
    .option('--per-repo', 'choose branches per repository')
    .option('-r, --requirement <text>', 'why this workspace exists (recorded in ledger)')
    .option('--name <name>', 'name for the .code-workspace file')
    .option('--ide', 'write window color / interpreter to settings without asking')
    .option('--no-ide', 'never touch settings')
    .option('-y, --yes', 'non-interactive: no prompts')
    .option('--json', 'print the result as JSON')
    .action(
      action(async (branchArg: string | undefined, flags: Flags) => {
        const isInteractive = !flags.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);

        const targetRepos = await resolveCliTargetRepos(flags, isInteractive);
        const branchLists = await Promise.all(targetRepos.map((r) => listBranches({ cwd: r.root })));
        const plans = await planCliBranches(targetRepos, branchLists, branchArg, flags, isInteractive);

        let requirement = flags.requirement?.trim();
        if (requirement === undefined && isInteractive) {
          const answer = bail(
            await p.text({
              message: 'Why does this workspace exist? Optional, recorded in ledger',
              placeholder: 'Feature work across repos',
            }),
          );
          requirement = answer.trim() || undefined;
        }

        let ide: 'yes' | 'no' = 'yes';
        if (flags.ide !== undefined) {
          ide = flags.ide ? 'yes' : 'no';
        } else if (isInteractive) {
          const confirm = bail(
            await p.confirm({
              message: `Write window colors and IDE settings to .vscode/settings.json in ${plans.length} worktree(s)?`,
              initialValue: true,
            }),
          );
          ide = confirm ? 'yes' : 'no';
        }

        if (isInteractive) {
          p.note(
            plans.map((pl) => `${pl.repo.name}: ${pl.branch}${pl.base ? ` (based on ${pl.base})` : ''}`).join('\n'),
            'Workspace Plan',
          );
          const proceed = bail(
            await p.confirm({
              message: `Create workspace across ${plans.length} repositories?`,
              initialValue: true,
            }),
          );
          if (!proceed) {
            p.cancel('Cancelled.');
            return;
          }
        }

        const results = await provisionCliWorktrees(plans, requirement, ide, isInteractive);
        await saveAndEmitWorkspace(results, plans, flags.name, flags.json);
      }),
    );

  ws.command('open [target]')
    .description('Open a multi-repository workspace in VS Code (by branch, name, or file)')
    .action(
      action(async (target?: string) => {
        const roots = await discoverWorkspaceRepoRoots(process.cwd());
        const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
        let chosenFile: string | undefined;

        if (target) {
          const lower = target.toLowerCase();
          const match = records.find(
            (r) =>
              r.branch.toLowerCase() === lower ||
              r.name.toLowerCase() === lower ||
              path.resolve(r.workspaceFile).toLowerCase() === path.resolve(target).toLowerCase() ||
              r.branch.toLowerCase().includes(lower) ||
              r.name.toLowerCase().includes(lower),
          );
          if (match) {
            chosenFile = match.workspaceFile;
          } else if (target.endsWith('.code-workspace') && (await exists(target))) {
            chosenFile = path.resolve(target);
          } else {
            throw new Error(
              `No workspace matches "${target}". Run \`para workspace list\` to see available workspaces.`,
            );
          }
        } else {
          if (records.length === 0) {
            throw new Error('No multi-repository workspaces found. Run \`para workspace list\` to check.');
          }
          if (records.length === 1) {
            chosenFile = records[0].workspaceFile;
          } else {
            chosenFile = await selectOption(
              'Select workspace to open:',
              records.map((r) => ({
                value: r.workspaceFile,
                label: r.branch,
                hint: `${r.repos.length} repos (${r.repos.map((repo) => repo.name).join(', ')})`,
              })),
            );
          }
        }

        if (chosenFile) {
          const opened = await openWithCode(chosenFile);
          if (opened) {
            ok(`Opening workspace in VS Code: ${pc.bold(chosenFile)}`);
          } else {
            ok(`Workspace ready: ${pc.bold(chosenFile)}`);
            console.log(pc.dim(`Run: code ${chosenFile}`));
          }
        }
      }),
    );

  ws.command('list')
    .alias('ls')
    .description('List recorded multi-repository parallel workspaces')
    .option('--json', 'print results as JSON')
    .action(
      action(async (flags: { json?: boolean }) => {
        const roots = await discoverWorkspaceRepoRoots(process.cwd());
        const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
        if (flags.json) {
          printJson(records);
          return;
        }
        if (records.length === 0) {
          console.log(pc.dim('No multi-repository workspaces found.'));
          return;
        }
        ok(`Found ${records.length} workspace(s):`);
        for (const record of records) {
          console.log(`\n  ${pc.bold(record.name)} (${pc.cyan(record.branch)})`);
          console.log(`    file: ${record.workspaceFile}`);
          console.log(`    repos: ${record.repos.map((r) => `${r.name} (${r.worktreePath})`).join(', ')}`);
        }
        console.log('');
      }),
    );
}
