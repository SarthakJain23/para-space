import path from 'node:path';
import * as p from '@clack/prompts';
import {
  discoverWorkspaceRepoRoots,
  exists,
  getWorkspaceRecords,
  listBranches,
  removeWorkspaceCascade,
} from '@para-space/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import { bail } from '../prompter.js';
import { action, log, ok, printJson } from '../runtime.js';
import {
  filterWorkspaceRecords,
  matchWorkspaceRecord,
  openWithCode,
  provisionCliWorktrees,
  saveAndEmitWorkspace,
} from './workspaceActions.js';
import { type Flags, planCliBranches, resolveCliTargetRepos, selectOption } from './workspacePrompts.js';

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
            await p.confirm({ message: `Create workspace across ${plans.length} repositories?`, initialValue: true }),
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
          const match =
            matchWorkspaceRecord(records, target) ??
            (roots.length > 0 ? matchWorkspaceRecord(await getWorkspaceRecords(), target) : undefined);
          if (match) {
            chosenFile = match.workspaceFile;
          } else if (target.endsWith('.code-workspace') && (await exists(target))) {
            chosenFile = path.resolve(target);
          } else {
            throw new Error(
              `No workspace matches "${target}". Run \`para workspace list\` to see available workspaces.`,
            );
          }
        } else if (records.length === 0) {
          throw new Error('No multi-repository workspaces found. Run `para workspace list` to check.');
        } else if (records.length === 1) {
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

        if (chosenFile) {
          if (await openWithCode(chosenFile)) {
            ok(`Opening workspace in VS Code: ${pc.bold(chosenFile)}`);
          } else {
            ok(`Workspace ready: ${pc.bold(chosenFile)}`);
            console.log(pc.dim(`Run: code ${chosenFile}`));
          }
        }
      }),
    );

  ws.command('list [query]')
    .alias('ls')
    .description('List recorded multi-repository parallel workspaces')
    .option('-q, --query <query>', 'filter workspaces by name, branch, repository, or path')
    .option('--json', 'print results as JSON')
    .action(
      action(async (queryArg: string | undefined, flags: { query?: string; json?: boolean }) => {
        const roots = await discoverWorkspaceRepoRoots(process.cwd());
        const allRecords = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
        const records = filterWorkspaceRecords(allRecords, flags.query ?? queryArg);
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

  ws.command('remove <target>')
    .alias('rm')
    .description('Remove a recorded multi-repository workspace (by branch, name, or file)')
    .option('--delete-file', 'also delete the .code-workspace file from disk')
    .option('--remove-worktrees', 'also remove all member worktrees of the workspace')
    .option('-d, --delete-branch', 'also delete the branch when removing member worktrees')
    .option('-f, --force', 'force removal of dirty worktrees or unmerged branches')
    .option('-y, --yes', 'non-interactive: no prompts')
    .action(
      action(
        async (
          target: string,
          flags: {
            deleteFile?: boolean;
            removeWorktrees?: boolean;
            deleteBranch?: boolean;
            force?: boolean;
            yes?: boolean;
          },
        ) => {
          const roots = await discoverWorkspaceRepoRoots(process.cwd());
          const records = await getWorkspaceRecords(roots.length > 0 ? roots : undefined);
          const match =
            matchWorkspaceRecord(records, target) ??
            (roots.length > 0 ? matchWorkspaceRecord(await getWorkspaceRecords(), target) : undefined);
          if (!match) {
            throw new Error(
              `No workspace matches "${target}". Run \`para workspace list\` to see available workspaces.`,
            );
          }

          const isInteractive = !flags.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);
          let deleteFile = Boolean(flags.deleteFile);
          if (flags.deleteFile === undefined && isInteractive) {
            deleteFile = bail(
              await p.confirm({
                message: `Also delete workspace file ${match.workspaceFile} from disk?`,
                initialValue: false,
              }),
            );
          }

          const { removedWorktrees, errors } = await removeWorkspaceCascade({
            workspace: match,
            removeWorktrees: Boolean(flags.removeWorktrees),
            deleteWorkspaceFile: deleteFile,
            deleteBranch: flags.deleteBranch,
            force: flags.force,
            log,
          });
          for (const errMsg of errors) {
            log.warn(`Could not remove worktree: ${errMsg}`);
          }
          const wtMsg = removedWorktrees.length > 0 ? ` (${removedWorktrees.length} worktree(s) removed)` : '';
          ok(
            `Removed workspace ${pc.bold(match.name)}${wtMsg}${deleteFile ? ` and deleted ${match.workspaceFile}` : ''}`,
          );
        },
      ),
    );
}
