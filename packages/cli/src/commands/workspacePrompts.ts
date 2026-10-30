import path from 'node:path';
import * as p from '@clack/prompts';
import {
  type WorkspaceRecord,
  branchExists,
  discoverCandidateReposForWorkspace,
  discoverWorkspaceRepoRoots,
  mainRepoRoot,
  resolveRepoInput,
  sharedBranches,
  validateBranchName,
} from '@para-space/core';
import { bail } from '../prompter.js';

export interface Flags {
  repo?: string[];
  branch?: string;
  base?: string;
  perRepo?: boolean;
  requirement?: string;
  name?: string;
  ide?: boolean;
  yes?: boolean;
  json?: boolean;
}

export interface TargetRepo {
  root: string;
  name: string;
}

export interface BranchPlan {
  repo: TargetRepo;
  branch: string;
  base?: string;
}

export async function selectOption<T extends string>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
): Promise<T> {
  const result = await p.select<any, T>({
    message,
    options,
  });
  return bail(result as T | symbol);
}

export async function promptPerRepo(
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
export async function resolveCliTargetRepos(flags: Flags, isInteractive: boolean): Promise<TargetRepo[]> {
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

/** Resolves repositories to add to an existing workspace from `--repo` flags or interactive sibling discovery. */
export async function resolveCliReposToAdd(
  workspace: WorkspaceRecord,
  flags: Flags,
  isInteractive: boolean,
  baseDir = process.cwd(),
): Promise<TargetRepo[]> {
  let selectedRoots: string[] = [];
  if (flags.repo && flags.repo.length > 0) {
    const resolved = await Promise.all(flags.repo.map((r) => resolveRepoInput(r, baseDir, workspace)));
    selectedRoots = Array.from(new Set(resolved));
  } else {
    const candidates = await discoverCandidateReposForWorkspace(workspace, baseDir);
    if (candidates.length === 0) {
      throw new Error(
        `No additional Git repositories found to add to workspace "${workspace.name}". Pass --repo <path...> to specify repositories.`,
      );
    }
    if (!isInteractive) {
      throw new Error('Pass --repo <path...> to specify repositories to add in non-interactive mode.');
    }
    selectedRoots = bail(
      await p.multiselect({
        message: `Select repositories to add to workspace "${workspace.name}" (${workspace.branch}):`,
        options: candidates.map((r) => ({ value: r, label: path.basename(r), hint: r })),
        initialValues: candidates,
        required: true,
      }),
    );
  }
  return selectedRoots.map((root) => ({ root, name: path.basename(root) }));
}

/** Resolves branch plans for all target repositories either from flags, shared selection, or per-repo prompts. */
export async function planCliBranches(
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
